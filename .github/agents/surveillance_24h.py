#!/usr/bin/env python3
"""Surveillance 24 h/24 de NexiaWallet, lancee par GitHub Actions toutes les 15 minutes
(meme quand le PC de Pablo est eteint).

Verifie : le site (avec et sans www), l'API, que l'application se charge vraiment,
les certificats HTTPS, les protections du navigateur et le relais d'images NFT.
- tout va bien      -> le passage est vert ;
- panne / probleme  -> le passage est ROUGE : GitHub envoie un e-mail a Pablo, et le
                       PC de Pablo l'affiche dans la cloche Jarvis des qu'il est rallume.
Resultat lisible dans l'onglet Actions (resume du passage) et dans le fichier
surveillance.json (artefact garde 7 jours, relu par le PC de Pablo).
Bibliotheque standard uniquement. Aucune donnee secrete n'est utilisee ni affichee.
"""
import datetime as dt
import json
import os
import re
import socket
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

SITE = "https://www.nexiawallet.com"
API = "https://crypto-wallet-backend-production-5c6c.up.railway.app"
CIBLES = [("Site (nexiawallet.com)", "https://nexiawallet.com"), ("Site (www.nexiawallet.com)", SITE),
          ("API serveur (/health)", API + "/health")]
LENT_MS = 5000


def lire(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "NexiaWallet-Surveillance-24h/1.0"})
    t = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return {"status": r.status, "ms": int((time.monotonic() - t) * 1000), "corps": r.read(8_000_000),
                    "entetes": {k.lower(): v for k, v in r.headers.items()}, "erreur": None}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "ms": int((time.monotonic() - t) * 1000), "corps": b"", "entetes": {}, "erreur": "HTTP %s" % e.code}
    except Exception as e:
        return {"status": None, "ms": int((time.monotonic() - t) * 1000), "corps": b"", "entetes": {}, "erreur": type(e).__name__}


def lire_avec_reessai(url):
    """Un seul echec reseau ne suffit pas pour crier a la panne : on reessaie apres 20 s."""
    r = lire(url)
    if r["status"] is None or r["status"] >= 500:
        time.sleep(20)
        r = lire(url)
    return r


def images_nft():
    """Le relais d'images NFT du serveur doit renvoyer une image que le navigateur accepte
    d'afficher sur nexiawallet.com (Cross-Origin-Resource-Policy: cross-origin). Jamais une
    panne (le site reste utilisable), seulement ATTENTION."""
    nom = "Images NFT (relais du serveur)"
    r = lire(API + "/wallet/nft/image-proxy?url=" + urllib.parse.quote("https://nexiawallet.com/icon.png", safe=""))
    if r["status"] != 200:
        return (nom, "ATTENTION", "le serveur ne relaie pas l'image de test (%s)" % (r["erreur"] or r["status"]))
    if not r["entetes"].get("content-type", "").startswith("image/"):
        return (nom, "ATTENTION", "le relais ne renvoie pas une image")
    corp = r["entetes"].get("cross-origin-resource-policy", "")
    if corp and corp != "cross-origin":
        return (nom, "ATTENTION", "images bloquees par le navigateur sur le site (Cross-Origin-Resource-Policy: %s)" % corp)
    return (nom, "OK", "image relayee et affichable sur le site")


def main():
    res, brutes = [], {}
    for nom, url in CIBLES:
        r = lire_avec_reessai(url)
        brutes[url] = r
        if r["status"] is None or r["status"] >= 400:
            res.append((nom, "PANNE", "ne repond pas correctement (%s)" % (r["erreur"] or r["status"])))
        elif r["ms"] > LENT_MS:
            res.append((nom, "LENT", "repond en %.1f s" % (r["ms"] / 1000)))
        else:
            res.append((nom, "OK", "repond en %.1f s" % (r["ms"] / 1000)))

    page = brutes[SITE]
    m = re.search(rb'src="(/_expo/static/js/web/[^"]+\.js)"', page["corps"])
    if page["status"] != 200:
        res.append(("Parcours client (l'app se charge)", "PANNE", "page d'accueil indisponible"))
    elif not m:
        res.append(("Parcours client (l'app se charge)", "PANNE", "la page ne reference plus l'application"))
    else:
        js = lire_avec_reessai(SITE + m.group(1).decode())
        if js["status"] != 200 or len(js["corps"]) < 100_000:
            res.append(("Parcours client (l'app se charge)", "PANNE", "l'application ne se charge pas"))
        else:
            res.append(("Parcours client (l'app se charge)", "OK", "application chargee (%.1f Mo)" % (len(js["corps"]) / 1e6)))

    mini = None
    for h in ("nexiawallet.com", "www.nexiawallet.com", API.split("//")[1]):
        try:
            with socket.create_connection((h, 443), timeout=10) as s:
                with ssl.create_default_context().wrap_socket(s, server_hostname=h) as t:
                    j = int((ssl.cert_time_to_seconds(t.getpeercert()["notAfter"]) - time.time()) // 86400)
            mini = j if mini is None else min(mini, j)
        except Exception:
            pass
    if mini is not None:
        res.append(("Certificats HTTPS", "PANNE" if mini < 7 else ("ATTENTION" if mini < 21 else "OK"),
                    "le plus proche expire dans %d jours" % mini))

    e = page["entetes"]
    manque = [n for n, ok in (("HSTS", "max-age" in e.get("strict-transport-security", "")),
                              ("nosniff", e.get("x-content-type-options", "").lower() == "nosniff"),
                              ("anti-clickjacking", "x-frame-options" in e)) if not ok]
    if page["status"] == 200:
        res.append(("Protections du navigateur", "ATTENTION" if manque else "OK",
                    ("manquant : " + ", ".join(manque)) if manque else "presentes"))

    res.append(images_nft())

    pannes = [r for r in res if r[1] == "PANNE"]
    global_ = "PROBLEME DETECTE" if pannes else ("ATTENTION" if any(r[1] in ("LENT", "ATTENTION") for r in res) else "TOUT VA BIEN")
    quand = dt.datetime.now(dt.timezone.utc)
    etat = {"global": global_, "quand_utc": quand.isoformat(timespec="seconds"),
            "resume": ("PANNE : " + ", ".join(r[0] for r in pannes)) if pannes else global_,
            "resultats": [{"nom": n, "etat": s, "detail": d} for n, s, d in res]}
    with open("surveillance.json", "w", encoding="utf-8") as f:
        json.dump(etat, f, ensure_ascii=False, indent=1)
    resume = os.environ.get("GITHUB_STEP_SUMMARY")
    lignes = ["## Surveillance NexiaWallet : %s" % global_, "", "| Verification | Etat | Detail |", "|---|---|---|"]
    lignes += ["| %s | %s | %s |" % r for r in res]
    if resume:
        with open(resume, "a", encoding="utf-8") as f:
            f.write("\n".join(lignes) + "\n")
    print("\n".join(lignes))
    return 1 if pannes else 0


if __name__ == "__main__":
    sys.exit(main())

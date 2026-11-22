// wallet-final/components/WebQrScanner.js
// ─────────────────────────────────────────────────────────────────
//  Scanner de QR code pour la version web (sorti d'App.js, chantier V3 de
//  decoupage, sans changement de comportement). Le natif utilise CameraView.
// ─────────────────────────────────────────────────────────────────

import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import jsQR from 'jsqr';

// ═══════════════════════════════════════════════════════════
//  QR CODE RÉEL
// ═══════════════════════════════════════════════════════════
// Scanner QR pour le web — expo-camera n'a pas de shim web fonctionnel
// (useCameraPermissions/CameraView plantent, voir le commentaire plus bas
// dans le composant principal). Le natif continue d'utiliser CameraView.
//
// Deux voies, parce que la caméra en direct d'un navigateur reste fragile sur
// iPhone — le scan en direct y échouait encore après correction des
// redémarrages, sans qu'on puisse reproduire la caméra de Safari sur PC :
//
//  1. Scan en direct : getUserMedia + un <video> DOM inséré à la main dans
//     un View (React Native Web ne permet pas d'écrire <video> en JSX), et
//     jsQR sur des images copiées dans un <canvas>. Une ligne d'état dit ce
//     qui se passe (caméra démarrée ? images reçues ? image noire ?), pour
//     qu'une capture d'écran suffise à diagnostiquer un échec à distance.
//
//  2. Photo : <input type="file" accept="image/*">. Sur iPhone il propose
//     l'appareil photo NATIF — vrai autofocus, stabilisation — ou la galerie,
//     et l'on décode la photo. Sert aussi pour un QR reçu en capture d'écran,
//     et reste disponible quand l'accès à la caméra est refusé.

// Décodage en direct limité à ~8 images/s et à 960 px de côté : jsQR sur
// l'image pleine résolution à chaque rafraîchissement coûtait 39 ms par image
// en 1080p et 155 ms en 4K sur un PC — plusieurs fois plus sur un téléphone.
// L'aperçu, lui, reste fluide : c'est la balise <video> qui l'affiche.
const QR_DECODE_INTERVAL_MS = 120;
const QR_DECODE_MAX_SIDE = 960;
const QR_DECODE_FULL_SIDE = 640;
const QR_STATUS_INTERVAL_MS = 500;
// Sans aucune image exploitable après ce délai, on le dit à l'utilisateur.
const QR_NO_FRAME_AFTER_MS = 5000;
// Luminosité moyenne (0-255) sous laquelle l'image reçue est considérée noire.
const QR_BLACK_FRAME_LUMINANCE = 8;

function qrWorkspace() {
  const canvas = document.createElement('canvas');
  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
}

function meanLuminance(data) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4 * 53) {
    sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    n += 1;
  }
  return n ? sum / n : 0;
}

// Carré central d'une image : là où l'on vise, et là où un QR petit ou
// lointain garde le plus de pixels par module.
function centerSquare(width, height, ratio) {
  const side = Math.round(Math.min(width, height) * ratio);
  return [Math.round((width - side) / 2), Math.round((height - side) / 2), side, side];
}

// Décode un QR dans une zone d'une image (vidéo ou photo), ramenée à au plus
// `maxSide` pixels de côté. Renvoie son contenu (ou null) et la luminosité
// moyenne de la zone, qui trahit une image noire.
function decodeQrRegion(ws, source, x, y, w, h, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const ow = Math.max(1, Math.round(w * scale));
  const oh = Math.max(1, Math.round(h * scale));
  if (ws.canvas.width !== ow || ws.canvas.height !== oh) { ws.canvas.width = ow; ws.canvas.height = oh; }
  ws.ctx.drawImage(source, x, y, w, h, 0, 0, ow, oh);
  const image = ws.ctx.getImageData(0, 0, ow, oh);
  const code = jsQR(image.data, ow, oh);
  return { data: code && code.data ? code.data : null, luminance: meanLuminance(image.data) };
}

const CAMERA_ERROR_MESSAGES = {
  NotAllowedError: "Accès à la caméra refusé. Autorise-le dans les réglages de Safari, ou prends le QR en photo avec le bouton en bas.",
  NotFoundError: 'Aucune caméra détectée sur cet appareil. Tu peux choisir une photo du QR avec le bouton en bas.',
  NotReadableError: 'La caméra est déjà utilisée par une autre application. Ferme-la, ou prends le QR en photo avec le bouton en bas.',
  SecurityError: 'Le scan caméra nécessite une connexion sécurisée (https). Tu peux choisir une photo du QR avec le bouton en bas.',
};

export default function WebQrScanner({ onScanned }) {
  const containerRef = useRef(null);
  const photoInputRef = useRef(null);
  const [error, setError] = useState(null);
  const [live, setLive] = useState({ started: false, width: 0, height: 0, analysed: 0, luminance: null, readyState: 0, elapsed: 0 });
  const [photo, setPhoto] = useState(null); // null | 'analyse' | 'echec'

  // La caméra ne doit démarrer qu'UNE fois par ouverture du scanner. Avant,
  // l'effet dépendait de `onScanned`, que l'appelant recrée à chaque rendu —
  // et l'app se redessine seule toutes les 25 à 45 s. Chaque rendu arrêtait
  // puis relançait la caméra : 10 redémarrages mesurés en 60 s. On lit donc
  // la dernière version du rappel dans une ref, et l'effet ne dépend de rien.
  const onScannedRef = useRef(onScanned);
  useEffect(() => { onScannedRef.current = onScanned; }, [onScanned]);

  // Entrée fichier cachée, créée dans le DOM : React Native Web ne rend pas
  // <input type="file">. Sans l'attribut capture, iOS propose à la fois
  // l'appareil photo et la photothèque.
  useEffect(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('data-testid', 'qr-photo-input');
    input.style.display = 'none';
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.value = ''; // permet de rechoisir la même photo après un échec
      if (!file) return;
      setPhoto('analyse');
      let url = null;
      try {
        url = URL.createObjectURL(file);
        // Surtout pas `new Image()` : dans ce fichier, `Image` est le composant
        // importé de react-native, pas l'image du navigateur. `.decode()`
        // n'existait pas, l'exception partait dans le catch et l'écran
        // affichait « aucun QR trouvé » même sur une photo parfaitement nette.
        const img = document.createElement('img');
        img.src = url;
        await img.decode();
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const ws = qrWorkspace();
        // Plusieurs zones et plusieurs tailles. Mesuré sur une photo réaliste
        // (QR incliné, flou, JPEG, bruit de capteur ±19) : jsQR échoue à
        // 1400 px sur toutes les zones, mais réussit dès 900 px et en dessous
        // — la réduction fait la moyenne des pixels voisins et efface le
        // bruit. Les grandes tailles restent utiles pour un QR petit dans la
        // photo, pris de loin.
        const full = [0, 0, w, h];
        const essais = [
          [full, 800],
          [centerSquare(w, h, 0.7), 800],
          [full, 1400],
          [centerSquare(w, h, 0.5), 800],
          [full, 500],
          [centerSquare(w, h, 0.3), 600],
        ];
        for (const [[x, y, zw, zh], maxSide] of essais) {
          const result = decodeQrRegion(ws, img, x, y, zw, zh, maxSide);
          if (result.data) { setPhoto(null); onScannedRef.current(result.data); return; }
          await new Promise((resolve) => setTimeout(resolve, 0)); // laisse l'interface respirer
        }
        setPhoto('echec');
      } catch (e) {
        // Une panne n'est pas une photo sans QR : les confondre a masqué le
        // bug ci-dessus. On le dit autrement, avec le code technique.
        console.warn('Lecture de la photo du QR impossible', e);
        setPhoto(`erreur:${(e && e.name) || 'Error'}`);
      } finally {
        if (url) URL.revokeObjectURL(url);
      }
    });
    document.body.appendChild(input);
    photoInputRef.current = input;
    return () => { if (input.parentNode) input.parentNode.removeChild(input); };
  }, []);

  useEffect(() => {
    let stopped = false;
    let rafId = null;
    let stream = null;
    let videoEl = null;
    let lastDecode = 0;
    let lastStatus = 0;
    let analysed = 0;
    let luminance = null;
    let ticks = 0;
    const startedAt = performance.now();
    const cropWs = qrWorkspace();
    const smallWs = qrWorkspace();
    const tinyWs = qrWorkspace();
    const fullWs = qrWorkspace();

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        videoEl = document.createElement('video');
        // iOS Safari : sans ces attributs posés AVANT la lecture, la vidéo
        // passe en plein écran natif ou refuse de démarrer seule.
        videoEl.setAttribute('playsinline', 'true');
        videoEl.setAttribute('muted', '');
        videoEl.setAttribute('autoplay', '');
        videoEl.muted = true;
        videoEl.style.width = '100%';
        videoEl.style.height = '100%';
        videoEl.style.objectFit = 'cover';
        videoEl.srcObject = stream;
        if (containerRef.current) containerRef.current.appendChild(videoEl);
        await videoEl.play();
        if (stopped) return;
        setLive((s) => ({ ...s, started: true }));

        const tick = (now) => {
          if (stopped) return;
          const vw = videoEl.videoWidth;
          const vh = videoEl.videoHeight;
          // HAVE_CURRENT_DATA suffit à drawImage ; exiger HAVE_ENOUGH_DATA,
          // comme avant, peut ne jamais arriver sur un flux caméra en direct.
          if (videoEl.readyState >= videoEl.HAVE_CURRENT_DATA && vw > 0 && vh > 0 && now - lastDecode >= QR_DECODE_INTERVAL_MS) {
            lastDecode = now;
            ticks += 1;
            const [cx, cy, cw, ch] = centerSquare(vw, vh, 0.7);
            const cropSide = Math.min(cw, QR_DECODE_MAX_SIDE);
            let result = decodeQrRegion(cropWs, videoEl, cx, cy, cw, ch, cropSide);
            luminance = result.luminance;
            // Puis le même carré réduit de moitié, et au tiers. Mesuré : filmé
            // en intérieur, le bruit du capteur suffit à faire échouer jsQR à
            // pleine résolution dès que le QR est un peu loin (35 % de la
            // hauteur, bruit ±19), alors que la réduction — qui fait la moyenne
            // des pixels voisins et efface ce bruit — le décode.
            if (!result.data) result = decodeQrRegion(smallWs, videoEl, cx, cy, cw, ch, Math.round(cropSide / 2));
            if (!result.data) result = decodeQrRegion(tinyWs, videoEl, cx, cy, cw, ch, Math.round(cropSide / 3));
            // Une fois sur trois, l'image entière aussi : un QR hors du cadre.
            if (!result.data && ticks % 3 === 0) result = decodeQrRegion(fullWs, videoEl, 0, 0, vw, vh, QR_DECODE_FULL_SIDE);
            analysed += 1;
            if (result.data) { onScannedRef.current(result.data); return; }
          }
          if (now - lastStatus >= QR_STATUS_INTERVAL_MS) {
            lastStatus = now;
            setLive({ started: true, width: vw, height: vh, analysed, luminance, readyState: videoEl.readyState, elapsed: now - startedAt });
          }
          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      } catch (e) {
        // Les navigateurs normalisent le `name` des erreurs getUserMedia
        // (contrairement au `message`, souvent vague) : plus fiable pour
        // expliquer la vraie cause.
        if (!stopped) setError((e && e.name) || 'UnknownError');
      }
    })();

    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (videoEl && videoEl.parentNode) videoEl.parentNode.removeChild(videoEl);
    };
  }, []);

  const openPhoto = () => { if (photoInputRef.current) photoInputRef.current.click(); };

  let statusMessage = 'Démarrage de la caméra…';
  if (live.started) {
    if (live.analysed === 0 && live.elapsed > QR_NO_FRAME_AFTER_MS) statusMessage = "La caméra ne transmet pas d'image. Prends plutôt le QR en photo.";
    else if (live.analysed > 0 && live.luminance !== null && live.luminance < QR_BLACK_FRAME_LUMINANCE) statusMessage = 'La caméra renvoie une image noire. Prends plutôt le QR en photo.';
    else if (live.analysed > 0) statusMessage = "Recherche d'un QR code…";
  }
  const technicalLine = live.started
    ? `${live.width}×${live.height} · ${live.analysed} images analysées · luminosité ${live.luminance === null ? '—' : Math.round(live.luminance)} · état ${live.readyState}`
    : '';

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#E5E7EB', textAlign: 'center', fontSize: 15, lineHeight: 22 }}>
            {CAMERA_ERROR_MESSAGES[error] || "Impossible d'accéder à la caméra. Prends plutôt le QR en photo avec le bouton en bas."}
          </Text>
          {/* Le nom technique de l'erreur, discret : sans lui, un « ça ne marche
              pas » signalé depuis un téléphone est impossible à diagnostiquer. */}
          {!CAMERA_ERROR_MESSAGES[error] && (
            <Text style={{ color: '#6B7280', textAlign: 'center', fontSize: 11, marginTop: 10 }}>Code : {error}</Text>
          )}
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: '70%', maxWidth: 320, aspectRatio: 1, borderWidth: 3, borderColor: 'rgba(16,185,129,0.95)', borderRadius: 20 }} />
            <Text style={{ color: '#FFFFFF', marginTop: 18, fontSize: 15, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6 }}>
              Place le QR code dans le cadre
            </Text>
          </View>
        </View>
      )}
      <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 28, backgroundColor: '#000' }}>
        {!error && <Text style={{ color: '#D1D5DB', textAlign: 'center', fontSize: 13 }}>{statusMessage}</Text>}
        {!error && !!technicalLine && <Text style={{ color: '#6B7280', textAlign: 'center', fontSize: 10, marginTop: 4 }}>{technicalLine}</Text>}
        <TouchableOpacity
          onPress={openPhoto}
          disabled={photo === 'analyse'}
          accessibilityRole="button"
          accessibilityLabel="Prendre ou choisir une photo du QR code"
          style={{ marginTop: 14, backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 15, alignItems: 'center', opacity: photo === 'analyse' ? 0.7 : 1 }}
        >
          <Text style={{ color: '#000', fontWeight: '700', fontSize: 15 }}>
            {photo === 'analyse' ? 'Analyse de la photo…' : 'Prendre ou choisir une photo du QR'}
          </Text>
        </TouchableOpacity>
        {photo === 'echec' && (
          <Text style={{ color: '#FCA5A5', textAlign: 'center', marginTop: 10, fontSize: 13, lineHeight: 19 }}>
            Aucun QR code trouvé sur cette photo. Cadre-le bien, au centre et net, puis réessaie.
          </Text>
        )}
        {typeof photo === 'string' && photo.startsWith('erreur:') && (
          <Text style={{ color: '#FCA5A5', textAlign: 'center', marginTop: 10, fontSize: 13, lineHeight: 19 }}>
            Impossible de lire cette photo. Essaie une autre image.{'\n'}
            <Text style={{ color: '#6B7280', fontSize: 11 }}>Code : {photo.slice('erreur:'.length)}</Text>
          </Text>
        )}
      </View>
    </View>
  );
}

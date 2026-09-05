# QR P2P Transfer

Send files and folders directly between devices over an encrypted peer-to-peer
link. Scan a QR code (or type a 6-digit room code), and bytes flow straight from
one browser to another over WebRTC — no upload to a server, no account, no size
limit imposed by someone else's storage plan.

This is a from-scratch rebuild of the original QR-scan-to-connect prototype, with
a full feature pass on top: multi-device rooms, Quick Connect, optional
end-to-end encryption, folder structure preservation, auto-save, transfer
history, and an installable offline-capable app shell.

## Features

- **QR or 6-digit code pairing.** Scan to connect instantly, or read the code out
  loud / type it in — both resolve to the same link.
- **Quick Connect.** Devices you've linked with before show up as one-tap chips.
  Reopening the app on the *hosting* device reclaims the same code where
  possible, so the "reconnect" chip on the other device actually works.
- **Rooms, not just pairs.** More than two devices can link at once (a simple
  star topology: everyone connects to whoever showed the QR code first, and that
  device relays broadcasts to the rest of the room). Send to one specific device
  or to everyone at once.
- **Folder transfers with structure preserved.** Picking a folder zips it
  client-side (paths intact) before sending; the receiver can save the `.zip` or,
  on browsers that support the File System Access API, extract it straight back
  into a real folder on disk.
- **Optional end-to-end passphrase encryption.** Type the same passphrase on both
  devices and files are encrypted (AES-256-GCM, PBKDF2 key derivation) before
  they ever leave the browser. The passphrase itself is never transmitted.
- **Auto-save.** Turn it on and incoming files save immediately, no click
  required. The app remembers which device names you've trusted and re-enables
  it automatically next time you link with them.
- **Transfer history.** Persisted locally (IndexedDB), survives a reload.
  Received files up to 300MB keep a stored copy so you can download them again
  later without asking the sender to resend.
- **Installable PWA.** Add it to your home screen; the app shell (not your
  files, which never touch a server) is cached for fast, semi-offline loads.
- **No build step.** Every file here is what ships — open `index.html`, or run
  the zero-dependency dev server, and you're looking at the real source.

### Honest scope notes

A few ideas from the original feature brainstorm didn't make the cut, on
purpose:

- **"Nearby device discovery" (like AirDrop) isn't implemented.** Browsers have
  no API to scan a Wi-Fi network for other browser tabs — that needs either a
  native app or a signaling/discovery server of some kind, which breaks the
  "zero backend" design this app is built around. Quick Connect (above) is the
  practical substitute: it removes the *repeat* friction, even though the very
  first pairing still needs a QR/code.
- **Resume across a dropped connection is best-effort, not byte-perfect.** If a
  transfer is interrupted, it's logged as failed and can be retried from
  scratch — there's no on-disk chunk cache to resume a half-received file after
  a full page reload.
- **Folder extraction to a real directory** needs the File System Access API,
  which today means a Chromium-based desktop browser. Everywhere else, folder
  transfers still work — the receiver just gets a regular `.zip` to save and
  extract with the OS.

## Architecture

Static frontend, plain WebRTC via [PeerJS](https://peerjs.com/) for the actual
connection, no framework, no bundler.

```
qr-lan-transfer/
├── server.js              # zero-dependency static file server (Node http/fs only)
├── package.json           # no runtime dependencies
├── public/
│   ├── index.html
│   ├── manifest.json       # PWA manifest
│   ├── service-worker.js   # app-shell offline caching
│   ├── css/style.css
│   ├── icons/
│   └── js/
│       ├── main.js         # wires everything together (the only DOM-touching orchestrator)
│       ├── network.js      # PeerJS pairing, rooms, star-topology relay
│       ├── transfer.js     # chunked send/receive protocol, flow control
│       ├── crypto.js       # optional AES-GCM passphrase encryption
│       ├── zip.js          # folder zip/unzip (JSZip)
│       ├── db.js           # IndexedDB history + localStorage preferences
│       ├── ui.js           # DOM rendering helpers
│       └── pwa.js          # install prompt + service worker registration
```

**Only one server is involved anywhere, and it never sees your files.**
[PeerJS's public broker](https://peerjs.com/) does nothing but introduce two
browsers to each other (WebRTC signaling) — once a connection opens, file bytes
travel directly between the two devices. `server.js` in this repo just serves
the static app itself; swap in any static host (Vercel, Netlify, GitHub Pages,
`python -m http.server`, whatever you like) and the app works the same way.

### Why a room is a star, not a mesh

With 3+ devices, every guest connects directly to whoever is showing the QR
code (the "host" of that pairing session); guests don't connect to each other
directly. A broadcast message is relayed once, through the host, to everyone
else. This keeps the connection count low (N connections instead of N²) and is
simple enough to reason about — the trade-off is that a *guest* can only target
"everyone" or "the host," not one specific other guest directly. The host can
still target any single connected device.

## Running it

No installation step — there's nothing to `npm install`.

```bash
node server.js
# or: npm start
```

Then open the printed `http://localhost:3000` link, and the printed
`http://<your-lan-ip>:3000` link on another device on the same Wi-Fi. Any other
static file server works too (`npx serve public`, nginx, etc.) — just make sure
it serves the `public/` folder at its root.

> Service workers (used for the offline app shell / install prompt) require a
> real HTTP origin — opening `index.html` directly via `file://` still works for
> transfers, just without the installable/offline pieces.

## Security notes

- The optional passphrase encryption uses AES-256-GCM with a PBKDF2-derived key
  (150,000 iterations, SHA-256, a fresh random salt per file). It's a genuine
  safeguard for a peer-to-peer tool, not an independently audited
  implementation — treat it accordingly for anything highly sensitive.
- Without a passphrase, transfers still aren't visible to any server (WebRTC
  data channels are DTLS-encrypted in transit by the browser itself) — the
  optional passphrase adds a second, application-level layer on top of that,
  useful mainly if you don't fully trust everyone who could see the pairing
  code.
- Room codes are short (6 digits) and meant for "the person standing next to
  you," not as a secret over the open internet — don't post one publicly while
  a sensitive transfer is pending.

## Browser support

Built on WebRTC, the File API, IndexedDB, and the Web Crypto API — current
Chrome, Edge, Firefox, and Safari all support the core transfer flow. Folder
*picking* (`<input webkitdirectory>`) and folder *extraction to disk* (File
System Access API) are desktop-Chromium-only today; folder *sending* still
degrades gracefully to a downloadable `.zip` everywhere else.

## Credits

[PeerJS](https://peerjs.com/) (WebRTC), [qrcode.js](https://davidshimjs.github.io/qrcodejs/)
(QR rendering), [JSZip](https://stuk.github.io/jszip/) (folder zipping) — all
loaded from CDN, no bundling required.

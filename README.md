# QR LAN File Transfer

A learning-based, zero-installation file transfer system. Share files across devices on the same local network by scanning a QR code. No apps, no extensions, no cloud uploads.

## 🚀 Quick Start
1. Ensure Node.js is installed.
2. Run `npm install` to install dependencies.
3. Run `npm start` to launch the server.
4. Open `http://localhost:3000` on the sender device.
5. Open the displayed URL (or scan the QR code) on the receiver device.

## 🏗️ Architecture (Ponytail Principle)
- **Frontend**: Vanilla HTML/CSS/JS. No build tools. Libraries loaded via CDN.
- **Backend**: Minimal Node.js/Express server strictly for serving static files and local IP discovery.
- **Transfer**: Designed for direct browser-to-browser (WebRTC) or local HTTP streaming.

## 📁 Project Structure
- `/public`: All client-side code.
- `server.js`: Lightweight routing and network utility.
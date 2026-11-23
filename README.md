# Lighthouse Backend

Gateway backend untuk Lighthouse. Service ini menyimpan step, snapshot yang sudah di-redact, command, dan ack ke MongoDB; memanggil AI service; lalu menerbitkan command guide-only ke MQTT per student.

Run:

```bash
npm install
npm run check
npm run dev
```

Endpoint utama: `GET /health`, `GET /health/detailed`, `POST /steps`, `POST /snapshots`, `POST /answer`, dan `POST /commands`.

Jalankan schema awal dengan `mongosh "$MONGODB_URI" mongo-setup.js`. Configure credentials through environment variables. Never commit `.env`.

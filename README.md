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

## Deployment Coolify

Build pack Dockerfile, branch master, port 3000, health check /health. Set NODE_ENV=production, API_TOKEN (32+ karakter), MONGODB_URI, MQTT_URL (mqtts://), MQTT_USERNAME, MQTT_PASSWORD sebagai environment runtime, bukan build args. Semua endpoint selain /health memerlukan Authorization: Bearer API_TOKEN. Jangan distribusikan token admin bersama installer.

LAB_AI_URL boleh kosong sampai service AI dideploy; /answer mengembalikan 503 ai_not_configured. /health hanya liveness, bukan bukti database atau MQTT terhubung. /health/detailed memeriksa dependensi.

Belum tersedia: autentikasi per mahasiswa/kelas, Record Agent integration, pemuatan step MongoDB ke retrieval AI, dan orchestration answer -> command otomatis. Endpoint ini merupakan gateway terbatas; jangan menganggap demo praktikum end-to-end telah terverifikasi.

# Lighthouse Backend

Baseline backend for the Lighthouse lab assistant. It validates commands, publishes them to per-student MQTT topics, and exposes `/health` plus `/commands`.

Run:

```bash
npm install
npm run check
npm run dev
```

Configure credentials through environment variables. Never commit `.env`.

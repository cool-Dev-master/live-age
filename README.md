# Live Age — Real-Time Age Tracker

A modern, high-precision web application that tracks ages in real time down to the second, featuring detailed lifetime statistics, customizable themes, and client-side privacy.

---

## Features

- **Live Real-Time Ticking**: Track years, months, weeks, days, hours, minutes, and seconds live without clock drift.
- **Detailed Statistics View**: Click any card in normal mode to open an expanded statistics modal featuring:
  - Standard live breakdown (Years, Months, Weeks, Days, Hours, Minutes, Seconds).
  - **Lifetime Milestones**: Real-time cumulative units lived (Total Years, Total Months, Total Weeks, Total Days, Total Hours, Total Minutes, Total Seconds).
- **Multi-Language Support (i18n)**:
  - Supports **English** and **Tamil (தமிழ்)** out of the box with zero external dependencies.
  - Seamlessly translates live age cards, detailed lifetime milestones, modals, and date/time formatting.
  - Switch languages anytime from the Settings popover (persisted in `localStorage`).
  - Extensible dictionary located in `scripts/translation.js`.
- **Client-Side Privacy**:
  - All records are stored locally in the browser (`localStorage`).
  - No backend database, tracking scripts, or server secrets.
- **Encrypted Dataset Support (`script.enc`)**:
  - Supports loading pre-packaged encrypted datasets via `script.enc`.
  - Built with native **Web Crypto API** (`AES-256-GCM` with 96-bit nonce, `PBKDF2-HMAC-SHA-256` key derivation with 600,000 iterations).
  - Unlock via Settings popover or setup URL parameter (`?setup=<passphrase>` or `#setup=<passphrase>`).
  - Instant reset/lock via URL parameter (`?reset` or `#reset`).
- **Data Import / Export**:
  - Export and import records as plain text files directly from Settings.

---

## Packaging an Encrypted Dataset (`script.enc`)

An offline CLI script is provided in `scripts/` to package dataset records into `script.enc`:

```bash
node scripts/encrypt-script.mjs data.json script.enc
```

Supported formats:
- **JSON**:
  ```json
  [
    { "name": "Alice Smith", "dob": "1990-05-15", "birthTime": "14:30" },
    { "name": "Bob Smith", "dob": "1985-11-20", "birthTime": null }
  ]
  ```
- **Text** (comma-separated):
  ```text
  Alice Smith, 05-15-1990, 02-30-PM
  Bob Smith, 11-20-1985,
  ```

---

## License

MIT


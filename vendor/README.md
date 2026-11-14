# vendor/snscrape

Salinan dari https://github.com/JustAnotherArchivist/snscrape (lisensi GPLv3, lihat `snscrape/LICENSE`).

Perubahan dari upstream:
- `snscrape/modules/twitter.py` dihapus. Modul X/Twitter tidak dipakai di mcp-sosmed.
- `snscrape/modules/__init__.py` memakai `importlib` agar berjalan di Python 3.12+.

Dijalankan lewat `src/social/snscrape.js`, yang hanya mengizinkan daftar modul di whitelist.

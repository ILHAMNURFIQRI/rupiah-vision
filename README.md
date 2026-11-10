# Rupiah Vision

Aplikasi web untuk mendeteksi dan menghitung nominal uang rupiah menggunakan YOLO, FastAPI, dan webcam.

## Persiapan

Gunakan Python 3.11, lalu dari Git Bash pada folder proyek jalankan:

```bash
py -3.11 -m venv .venv
source .venv/Scripts/activate
python -m pip install -r requirements.txt
```

Pastikan file model tersedia di `model/my_model.pt`.

## Menjalankan aplikasi

```bash
python -m uvicorn main:app --reload
```

Buka <http://127.0.0.1:8000> dan izinkan akses kamera di browser.

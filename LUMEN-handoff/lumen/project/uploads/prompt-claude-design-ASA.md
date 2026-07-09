# Prompt untuk Claude Design — Proyek "LUMEN"

## Konteks Proyek

Buatkan prototype/mockup frontend untuk sebuah website bernama **LUMEN** — sebuah "sharing page" bilingual (Bahasa Indonesia & English) di mana orang bisa menuliskan mimpi, keinginan, atau harapan mereka secara anonim, dan setiap tulisan akan muncul sebagai **bintang** di sebuah peta langit malam interaktif. Semakin banyak orang menulis, semakin ramai dan hidup langitnya — seperti kumpulan harapan kolektif yang bisa dilihat semua orang.

Target: prototype visual + interaksi (mock data, belum perlu backend real), fokus ke experience dan estetika.

## Sistem Bilingual (PENTING — arsitektur inti)

- Sebelum masuk ke sky, user disambut layar pemilihan bahasa: **"Choose your sky" / "Pilih langitmu"** — dua pilihan besar (EN / ID), masing-masing dengan preview visual singkat (misal cuplikan animasi bintang di background tombol).
- Pilihan bahasa ini menentukan **sky mana yang mereka lihat**: wish berbahasa Inggris masuk ke populasi "EN Sky", wish berbahasa Indonesia masuk ke populasi "ID Sky" — dua semesta bintang yang terpisah, bukan cuma translasi UI.
- Setelah masuk, sediakan **toggle kecil** (ikon bulan/matahari atau simbol subtle lain, pojok layar) yang memungkinkan user "mengintip" sky bahasa lain tanpa perlu reset session — transisi antar sky bisa pakai fade/cross-dissolve halus.
- Semua UI copy (tombol, placeholder, pesan konfirmasi) harus punya versi EN dan ID yang setara secara nada (puitis-lembut di kedua bahasa, bukan translasi kaku Google-Translate-style).

## Konsep Inti

- Setiap wish = satu titik cahaya (bintang) di kanvas langit gelap.
- Bintang dikelompokkan menjadi **6 rasi tematik**, masing-masing dengan bentuk constellation dan warna aksen berbeda:
  1. **Cinta** — warna rose-gold pucat
  2. **Karier & Mimpi** — warna kuning keemasan
  3. **Keluarga** — warna hangat oranye lembut
  4. **Kesehatan & Penyembuhan** — warna hijau mint pucat
  5. **Kehilangan & Duka** — warna biru-ungu pucat (perlakukan dengan sensitif, lembut, bukan sedih berlebihan)
  6. **Diri Sendiri** — warna putih-perak

- Bintang yang mendapat interaksi ("didoakan" oleh pengguna lain) bersinar lebih terang; bintang lama yang tidak ada interaksi perlahan meredup (fading over time) — supaya langit terasa hidup, bukan archive statis.
- Garis tipis ala tinta (ink-trail, terinspirasi estetika sumi-e/cybersigilism) menghubungkan bintang-bintang dalam satu rasi yang sama, dengan animasi "growth" halus saat rasi terbentuk.

## Gaya Visual

- **Palet dasar**: navy gelap hampir hitam (#0a0e1a atau senada), dengan gradasi halus ke ungu gelap di horizon.
- **Tipografi**: Cormorant Garamond untuk teks wish (serif elegan, puitis), Space Mono untuk UI/label/button (monospace, modern, kontras).
- **Estetika**: minimalis, tenang, sedikit mistis — hindari kesan "app kasual/childish". Harus terasa seperti ruang kontemplasi, bukan social media biasa.
- **Animasi**: halus dan lambat (star twinkle, fade in/out, ink-trail growth), hindari animasi cepat/ramai yang merusak suasana tenang.

## Halaman & Fitur yang Perlu Dibuat

### 1. Landing / Sky View (halaman utama)
- Kanvas full-screen menampilkan langit dengan bintang-bintang (gunakan mock data ~30-50 wish tersebar di 6 rasi).
- Hover pada bintang → sedikit membesar & bersinar.
- Klik bintang → modal/popover muncul menampilkan teks wish (anonim), kategori, dan waktu relatif ("3 hari lalu").
- Tombol mengambang untuk "Tulis Harapanmu" yang membuka form submission.
- Filter/toggle untuk menampilkan hanya satu kategori rasi tertentu (opsional, bisa berupa legenda kategori di pojok layar yang bisa diklik).

### 2. Form Submission (modal atau halaman terpisah)
- Textarea dengan character limit (misal 200 karakter), counter real-time.
- Pilihan kategori (6 rasi di atas) — visual sebagai kartu kecil dengan ikon/warna masing-masing, bukan dropdown biasa.
- Pesan konfirmasi puitis setelah submit, misal "Harapanmu kini menjadi bintang di langit LUMEN." / "Your wish is now a star in the LUMEN sky."
- Indikasi cooldown/rate-limit jika user baru saja submit (misal "Kamu bisa menulis harapan lagi dalam 4 menit").

### 3. Interaksi "Doakan" (wish upon a star)
- Saat modal wish terbuka, ada tombol kecil "🌟 Doakan harapan ini" yang menambah jumlah interaksi dan membuat bintang tersebut bersinar lebih terang di background.
- Tampilkan jumlah "didoakan" secara halus (tidak seperti like counter media sosial yang mencolok — lebih puitis, misal "27 orang telah mendoakan ini").

### 4. Sistem Flag / Moderasi (UI saja untuk prototype ini)
- Tombol kecil dan tidak mencolok di modal wish: "Laporkan" (ikon bendera kecil, subtle, pojok modal).
- Saat diklik, muncul pilihan alasan singkat: Spam, Ujaran kebencian, Konten tidak pantas, Lainnya.
- Setelah flag terkirim: bintang yang bersangkutan visual-nya meredup (tidak langsung hilang) sebagai representasi status "pending review" — buatkan state visual untuk ini (bintang redup dengan sedikit efek "kabur/pudar").
- (Opsional) buatkan juga mockup sederhana halaman admin/dashboard untuk review wish yang di-flag: list wish dengan alasan flag, jumlah flag, tombol "Setujui" / "Hapus".

## Nada & Copy (Bilingual — ID & EN)

Semua teks UI (tombol, placeholder, pesan konfirmasi) punya versi ID dan EN dengan nada puitis-lembut yang setara, bukan translasi kaku. Contoh:

| Elemen | Bahasa Indonesia | English |
|---|---|---|
| Placeholder textarea | "Tuliskan mimpi atau harapanmu di sini..." | "Write your dream or wish here..." |
| Tombol submit | "Lepaskan ke Langit" | "Release to the Sky" |
| Empty state | "Langit ini menunggu harapan pertamanya." | "This sky is waiting for its first wish." |
| Konfirmasi setelah submit | "Harapanmu kini menjadi bintang di langit LUMEN." | "Your wish is now a star in the LUMEN sky." |
| Layar pemilihan bahasa | "Pilih langitmu" | "Choose your sky" |
| Tombol "doakan" | "Doakan harapan ini" | "Wish upon this star" |

Pastikan Claude Design membuat kedua versi copy ini konsisten secara nada — jangan sampai versi EN terasa lebih casual/kaku dibanding versi ID atau sebaliknya.

## Catatan Teknis untuk Prototype

- Gunakan mock/dummy data untuk bintang dan wish (tidak perlu backend nyata di tahap ini).
- Render bintang bisa pakai SVG atau Canvas — prioritaskan performa jika nanti scaling ke ratusan/ribuan titik.
- Pastikan responsive untuk mobile (interaksi tap, bukan hanya hover).

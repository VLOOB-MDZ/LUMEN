# [Nama Project] — Project Context

> Isi file ini di awal setiap project baru.
> Gunakan sebagai referensi bagi Claude agar langsung paham konteks tanpa penjelasan ulang.
>
> **Aturan penting:** Selalu perbarui file ini setiap kali ada perubahan pada project —
> fitur baru, perubahan tech stack, schema data berubah, keputusan teknis baru, dsb.
> File ini tidak berguna kalau isinya tidak mencerminkan kondisi project yang sebenarnya.

---

## Gambaran Project

**Deskripsi singkat:** [Apa yang dibangun, untuk siapa, tujuannya apa]

**Pemilik / Klien:** [Nama] ([email])

**Status:** [In progress / Live / Maintenance]

---

## Struktur File

```
/
├── [file utama]        # [fungsi]
├── [file kedua]        # [fungsi]
├── [folder/]           # [fungsi]
└── ...
```

---

## Tech Stack

| Layer | Teknologi | Alasan |
|---|---|---|
| Frontend | [framework/library] | [kenapa dipilih] |
| Backend / DB | [teknologi] | [kenapa dipilih] |
| Auth | [teknologi] | [kenapa dipilih] |
| Hosting | [platform] | [kenapa dipilih] |
| Lainnya | [teknologi] | [kenapa dipilih] |

---

## Konfigurasi & Credentials

> Isi bagian ini dengan config spesifik project (API keys, project ID, env vars, dll.)

```
[Nama service] :
  [key]  : [value]
  [key]  : [value]
```

---

## Schema Data

> Deskripsikan struktur data utama (database, API response, local state, dll.)

```js
// [Nama koleksi / tabel / objek]
{
  [field] : [tipe] ,  // [keterangan]
  [field] : [tipe] ,
}
```

---

## Fitur Utama

### [Nama Fitur 1]
- [Deskripsi singkat cara kerjanya]
- [File atau fungsi yang relevan]

### [Nama Fitur 2]
- [Deskripsi singkat cara kerjanya]
- [File atau fungsi yang relevan]

---

## Design System

**Font:** [Display font] + [Body font]

**Warna utama:**
```
primary   : [hex]  — [keterangan]
surface   : [hex]  — [keterangan]
secondary : [hex]  — [keterangan]
```

**Pola desain / catatan:**
- [Contoh: spacing token, shadow convention, animasi, dll.]

---

## Pola Kode Penting

> Catat pola atau konvensi yang dipakai di project ini agar konsisten.

```js
// [Nama pola]
// [Contoh kode atau penjelasan]
```

---

## Development Workflow

```bash
# Jalankan lokal
[perintah]

# Build / deploy
[perintah]

# Testing
[perintah]
```

---

## Keputusan Teknis

> Dokumentasikan pilihan penting dan alasannya — berguna saat revisit atau handoff.

| Keputusan | Alasan |
|---|---|
| [Pilihan teknis] | [Kenapa dipilih, trade-off yang diterima] |
| [Pilihan teknis] | [Kenapa dipilih, trade-off yang diterima] |

---

## Catatan Tambahan

> Hal-hal lain yang penting diketahui: keterbatasan, hutang teknis, rencana ke depan, dll.

- [Catatan]

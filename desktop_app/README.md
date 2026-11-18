# CNIC Copy Maker — Windows Desktop App

A tiny, offline Windows desktop utility built with **Python**, **PySide6**, **Pillow**, and **ReportLab** to arrange scanned Front and Back CNIC images onto a single A4 PDF page.

## Features
- Upload or drag-and-drop **JPG / JPEG / PNG** images into **FRONT** and **BACK** panels
- Automatic EXIF orientation correction
- Preserves original aspect ratio (never stretches or distorts)
- Optional non-destructive **Rotate (±90°)** and drag-to-**Crop**
- **Vertical** (stacked) or **Horizontal** (side-by-side) A4 arrangement
- One-click **GENERATE PDF** saved automatically as `CNIC_Copy_YYYY-MM-DD_HH-MM-SS.pdf`
- **Select Folder**, **Open PDF**, **Open Folder**, and **Reset** controls
- 100% offline processing — temporary images are deleted immediately after PDF creation

## Run from Source (Windows)
```bat
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python cnic_copy_maker.py
```

## Build Standalone Windows EXE
Run the included build script on Windows:
```bat
build_exe.bat
```
Or run PyInstaller directly:
```bat
pyinstaller --noconfirm --clean --onefile --windowed --name "CNIC Copy Maker" cnic_copy_maker.py
```
The standalone executable will be generated at:
`dist\CNIC Copy Maker.exe`

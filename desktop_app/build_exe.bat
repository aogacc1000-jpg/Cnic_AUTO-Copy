@echo off
setlocal
echo Building CNIC Copy Maker standalone Windows EXE...

python -m pip install --upgrade pip
python -m pip install -r requirements.txt

python -m PyInstaller ^
  --noconfirm ^
  --clean ^
  --onefile ^
  --windowed ^
  --name "CNIC Copy Maker" ^
  cnic_copy_maker.py

if %ERRORLEVEL% NEQ 0 (
    echo Build failed.
    exit /b %ERRORLEVEL%
)

echo.
echo Build complete! Standalone executable is located at:
echo   dist\CNIC Copy Maker.exe
endlocal

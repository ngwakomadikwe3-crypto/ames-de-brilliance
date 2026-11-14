@echo off
title HOUSEofAMES - development server (keep this window open)
cd /d "%~dp0"
echo.
echo  Starting HOUSEofAMES...  Keep this window open while you use the app.
echo  The app opens in your browser in a few seconds:  http://127.0.0.1:3000/app
echo  On your phone (same Wi-Fi):                      http://192.168.0.97:3000/app
echo.
start "" cmd /c "timeout /t 12 /nobreak >nul & start http://127.0.0.1:3000/app"
call npm run dev
pause

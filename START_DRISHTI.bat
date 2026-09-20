@echo off
title DRISHTI - Live Server + Tunnel
color 0A

echo ================================================
echo   DRISHTI - Diabetic Retinopathy AI Platform
echo   Starting backend server + public tunnel...
echo ================================================
echo.

:: Kill any existing instances
taskkill /F /IM ngrok.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
timeout /t 2 /nobreak >nul

:: Start Node.js backend server
echo [1/2] Starting DRISHTI backend server on port 5000...
start "DRISHTI Backend" /min cmd /c "cd /d "%~dp0backend" && node server.js"
timeout /t 4 /nobreak >nul

:: Start ngrok tunnel
echo [2/2] Starting ngrok public tunnel...
start "DRISHTI ngrok Tunnel" ngrok http 5000
timeout /t 6 /nobreak >nul

:: Get the public URL from ngrok API
echo.
echo Fetching your public URL...
powershell -Command "$t = Invoke-RestMethod http://localhost:4040/api/tunnels; $url = ($t.tunnels | Where-Object { $_.proto -eq 'https' }).public_url; Write-Host ''; Write-Host '================================================'; Write-Host '  PUBLIC URL: ' $url; Write-Host '================================================'; Write-Host ''; Write-Host '  Share this link for your demo!'; Write-Host '  Credentials: dr.ananya@dire.com / password123'; Write-Host ''"

echo.
echo Both windows are running. DO NOT close the ngrok window!
echo Press any key to open the app in your browser...
pause >nul
start "" "https://mulberry-uncertain-proofs.ngrok-free.dev"

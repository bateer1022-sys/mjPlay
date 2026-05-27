@echo off
setlocal
if not defined COCOS_CREATOR set "COCOS_CREATOR=C:\CocosDashboard\editors\Creator\2.4.12\CocosCreator.exe"
for %%I in ("%~dp0..") do set "PROJECT_DIR=%%~fI"

echo [build-web] project: %PROJECT_DIR%
echo [build-web] creator: %COCOS_CREATOR%

"%COCOS_CREATOR%" --path "%PROJECT_DIR%" --build "platform=web-mobile;debug=false"
if errorlevel 1 exit /b %errorlevel%

echo [build-web] done -^> %PROJECT_DIR%\build\web-mobile

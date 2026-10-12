@echo off
echo ==============================================================
echo   Pushing Vital Registry Test Cases to GitHub...
echo   Repository: https://github.com/Tejasree1024/Vital-registry2
echo ==============================================================
cd /d "%~dp0"
git push origin main
echo.
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] All 59 files, test suites, and Excel reports have been pushed to GitHub!
) else (
    echo [ERROR] Git push failed. Please check your GitHub permissions or credentials.
)
pause

@echo off
rem Build the RMS-Bot .exe (see build_exe.py). Run on a PC that already has Python + requirements.txt.
cd /d %~dp0
python build_exe.py %*
pause

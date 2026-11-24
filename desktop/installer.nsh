!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
  !define MUI_CUSTOMFUNCTION_ABORT ShowInstallerCancelled

  !macro customInit
    InitPluginsDir
    File "/oname=$PLUGINSDIR\installer-outcome.ico" "${BUILD_RESOURCES_DIR}\installer-outcome.ico"
  !macroend

  !macro customFinishPage
    !ifndef HIDE_RUN_AFTER_FINISH
      Function StartApp
        HideWindow
        ${if} ${isUpdated}
          StrCpy $1 " --updated"
        ${else}
          StrCpy $1 ""
        ${endif}
        ${If} ${UAC_IsAdmin}
          StrCpy $2 "$1"
          ${if} ${isUpdated}
            StrCpy $2 "--updated"
          ${endif}
          ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$2"
        ${Else}
          Exec '"$appExe"$1'
        ${EndIf}
      FunctionEnd

      !define MUI_FINISHPAGE_RUN
      !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
    !endif
    !insertmacro MUI_PAGE_FINISH
  !macroend

  Function ShowInstallerCancelled
    IfSilent done
    System::Store "s"
    System::Call 'user32::LoadImageW(p 0, w "$PLUGINSDIR\installer-outcome.ico", i 1, i 64, i 64, i 0x10) p.r0'
    ${If} $0 == 0
      MessageBox MB_OK|MB_ICONSTOP "Setup was cancelled. The installer picture could not be loaded."
    ${Else}
      ; NSIS is 32-bit: TASKDIALOGCONFIG is 96 bytes; its three strings share this allocation.
      System::Call '*(i 96, p $HWNDPARENT, p 0, i 0x100A, i 0x20, p 0, p r0, p 0, p 0, i 0, p 0, i 8, i 0, p 0, i 0, p 0, p 0, p 0, p 0, p 0, p 0, p 0, p 0, i 0, &w64 "${PRODUCT_NAME} Setup", &w64 "Installation cancelled", &w192 "Setup did not complete. You can run the installer again when you are ready.") p.r1'
      IntOp $2 $1 + 96
      IntOp $3 $2 + 128
      IntOp $4 $3 + 128
      System::Call '*$1(&v20, p r2, &v4, p r3, p r4)'
      System::Call 'comctl32::TaskDialogIndirect(p r1, p 0, p 0, p 0) i.r2'
      System::Free $1
      System::Call 'user32::DestroyIcon(p r0)'
      ${If} $2 != 0
        MessageBox MB_OK|MB_ICONSTOP "Setup was cancelled. The artwork dialog could not be displayed."
      ${EndIf}
    ${EndIf}
    System::Store "l"
    done:
  FunctionEnd
!endif

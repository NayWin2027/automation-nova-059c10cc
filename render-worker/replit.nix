{ pkgs }: {
  deps = [
    pkgs.nodejs_20
    pkgs.ffmpeg-full
    pkgs.chromium
    # Puppeteer / headless Chromium runtime libs
    pkgs.nss
    pkgs.nspr
    pkgs.atk
    pkgs.at-spi2-atk
    pkgs.at-spi2-core
    pkgs.cups
    pkgs.dbus
    pkgs.libdrm
    pkgs.gtk3
    pkgs.pango
    pkgs.cairo
    pkgs.alsa-lib
    pkgs.mesa
    pkgs.libxkbcommon
    pkgs.xorg.libX11
    pkgs.xorg.libXcomposite
    pkgs.xorg.libXdamage
    pkgs.xorg.libXext
    pkgs.xorg.libXfixes
    pkgs.xorg.libXrandr
    pkgs.xorg.libxcb
    pkgs.fontconfig
    pkgs.freetype
    # Myanmar + Latin fonts for subtitle rendering
    pkgs.noto-fonts
    pkgs.noto-fonts-cjk-sans
  ];

  env = {
    PUPPETEER_SKIP_DOWNLOAD = "true";
    PUPPETEER_EXECUTABLE_PATH = "${pkgs.chromium}/bin/chromium";
    FONTCONFIG_FILE = "${pkgs.fontconfig.out}/etc/fonts/fonts.conf";
  };
}
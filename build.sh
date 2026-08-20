#!/bin/sh
# Reassemble index.html from the pieces in build/.
set -e
cd "$(dirname "$0")"

{
  cat build/00_head.html
  echo '<style>'
  cat build/10_css_orig.css
  cat build/30_css_add.css
  echo '</style>'
  echo
  cat build/40_body.html
  echo
  echo '<script>'
  cat build/20_data.js
  cat build/50_core.js
  cat build/60_views.js
  cat build/70_init.js
  echo '</script>'
  echo '</body>'
  echo '</html>'
} > index.html

echo "built index.html ($(wc -c < index.html) bytes)"

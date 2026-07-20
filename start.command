#!/bin/bash
xattr -d com.apple.quarantine "$0" 2>/dev/null
cd "$(dirname "$0")"
node build/scripts/launcher.js

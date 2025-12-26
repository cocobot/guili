#!/bin/bash
set -e

dir="$(dirname "$0")"
dl_dir="$dir/_dl"
inst_dir="$dir/extra"
force=


download() {
  local url="$1"
  local file="${2:-$(basename "$url")}"
  if [ -z "$force" ] && [ -f "$dl_dir/$file" ]; then
    echo "$file already downloaded, skip"
    return
  fi
  echo "downloading $file"
  mkdir -p "$dl_dir"
  curl -s -o "$dl_dir/$file" "$url"
}

install() {
  local src="$1"
  local dest="$2"
  [[ $dest =~ /$ ]] && dest="$dest$(basename "$src")"
  echo "installing $dest"
  rm -fr "$inst_dir/$dest"
  mkdir -p "$(dirname "$inst_dir/$dest")"
  mv "$src" "$inst_dir/$dest" 
}


get_fontawesome() {
  echo "get font-awesome $1"
  local name="fontawesome-free-$1-web"
  download "https://use.fontawesome.com/releases/v$1/fontawesome-free-$1-web.zip" "$name.zip"
  rm -fr "$dl_dir/$name"
  ( cd _dl && unzip "$name.zip" "$name"/css/all.min.css "$name/webfonts/fa-*" )
  install "$dl_dir/$name/css/all.min.css" css/fontawesome.min.css
  for f in "$dl_dir/$name"/webfonts/*; do
    install "$f" webfonts/
  done
  rm -fr "$dl_dir/$name"
}


rm -fr "$inst_dir"/*

get_fontawesome 7.1.0


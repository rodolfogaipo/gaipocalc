#!/bin/bash
# Monta o APK Android do GAIPO CALC (roda sozinho no GitHub Actions).
set -euo pipefail
RUN=${GITHUB_RUN_NUMBER:-1}
RAIZ=$(pwd)
SITE=$RAIZ/site

mkdir -p app && cd app
npm init -y > /dev/null
npm i --no-audit --no-fund @capacitor/core@7.6.9 @capacitor/cli@7.6.9 @capacitor/android@7.6.9 @capacitor/camera@7.0.5 @capacitor-community/speech-recognition@7.0.1

# Só os arquivos do app vão para dentro do APK
mkdir www
for f in index.html manifest.webmanifest sw.js css js vendor img icons; do cp -r "$SITE/$f" www/; done
test -f www/index.html || { echo "index.html não encontrado"; exit 1; }

# Endereço do servidor da IA e código do app (configurados no GitHub)
SERV="${GAIPO_SERVIDOR:-}"
CHAVE="${GAIPO_CHAVE_APP:-}"
SERV_ESC=$(printf '%s' "$SERV" | sed 's/[\/&]/\\&/g')
CHAVE_ESC=$(printf '%s' "$CHAVE" | sed 's/[\/&]/\\&/g')
sed -i "s/export const SERVIDOR_IA = '';/export const SERVIDOR_IA = '$SERV_ESC';/; s/export const CHAVE_APP = '';/export const CHAVE_APP = '$CHAVE_ESC';/; s/export const VERSAO = 'dev';/export const VERSAO = '1.$RUN';/" www/js/config.js
if [ -n "$SERV" ]; then echo "Servidor da IA: $SERV"; else echo "::warning::GAIPO_SERVIDOR não configurado: a IA ficará desligada até configurar no app."; fi

cat > capacitor.config.json <<'JSON'
{
  "appId": "com.gaipo.calc",
  "appName": "GAIPO CALC",
  "webDir": "www",
  "backgroundColor": "#070B14",
  "android": { "adjustMarginsForEdgeToEdge": "force" }
}
JSON

npx cap add android
npx cap sync android
RES=android/app/src/main/res

# Ícone
rm -rf $RES/mipmap-anydpi-v26
for d in $RES/mipmap-*; do
  cp www/icons/icon-512.png $d/ic_launcher.png
  cp www/icons/icon-512.png $d/ic_launcher_round.png
  rm -f $d/ic_launcher_foreground.png
done

# Tela de abertura clara com a logo (igual à do app)
for f in $(find $RES -name splash.png); do
  S=$(identify -format '%wx%h' "$f")
  W=${S%x*}; H=${S#*x}; M=$(( (W < H ? W : H) * 6 / 10 ))
  convert -size "$S" xc:'#F1F3F7' \( www/img/logo-gaipocalc.png -resize ${M}x${M} \) -gravity center -composite "$f"
done

# Permissões: câmera (foto da questão), microfone (voz), internet (IA)
MAN=android/app/src/main/AndroidManifest.xml
sed -i 's#</manifest>#    <uses-permission android:name="android.permission.CAMERA"/>\n    <uses-permission android:name="android.permission.RECORD_AUDIO"/>\n    <uses-feature android:name="android.hardware.camera" android:required="false"/>\n    <uses-feature android:name="android.hardware.microphone" android:required="false"/>\n    <queries>\n        <intent><action android:name="android.speech.RecognitionService"/></intent>\n        <intent><action android:name="android.media.action.IMAGE_CAPTURE"/></intent>\n    </queries>\n</manifest>#' $MAN
grep -c RECORD_AUDIO $MAN

# Barras do sistema escuras
sed -i 's#<item name="android:background">@null</item>#<item name="android:background">@null</item><item name="android:statusBarColor">\#070B14</item><item name="android:navigationBarColor">\#070B14</item><item name="android:windowLightStatusBar">false</item><item name="android:forceDarkAllowed">false</item>#' $RES/values/styles.xml

# Versão
sed -i "s/versionCode 1/versionCode $RUN/; s/versionName \"1.0\"/versionName \"1.$RUN\"/" android/app/build.gradle

# Avisos de lint não travam a montagem
cat >> android/app/build.gradle <<'GRADLE'

android {
    lint {
        checkReleaseBuilds false
        abortOnError false
    }
}
GRADLE

cd android
chmod +x gradlew
./gradlew assembleRelease --no-daemon --console=plain -q

# Assinar
BT=$(ls -d $ANDROID_HOME/build-tools/* | sort -V | tail -1)
$BT/zipalign -f 4 app/build/outputs/apk/release/app-release-unsigned.apk alinhado.apk
$BT/apksigner sign --ks "$SITE/apk/chave.keystore" --ks-pass pass:gaipocalc --key-pass pass:gaipocalc --ks-key-alias gaipocalc --out "$RAIZ/GAIPO-CALC.apk" alinhado.apk
$BT/apksigner verify "$RAIZ/GAIPO-CALC.apk"
ls -la "$RAIZ/GAIPO-CALC.apk"
echo "Plugins no app:"; cat app/src/main/assets/capacitor.plugins.json

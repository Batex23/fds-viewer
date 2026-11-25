/**
 * Site configuration for remote loading (js/remote-loader.js).
 *
 * driveApiKey: a Google Cloud API key with the Google Drive API enabled.
 * It only gives read access to files that are already shared publicly
 * ("Anyone with the link"), so it is safe to publish here, PROVIDED it is
 * restricted in the Google Cloud console to:
 *   - API restrictions: Google Drive API only
 *   - Website restrictions: https://batex23.github.io/*
 *
 * A key can also be passed in the URL with &key=... for testing.
 */
window.FDS_VIEWER_CONFIG = {
    driveApiKey: 'AIzaSyA3l0KS7Uzd34B1cMB4DkgGyw2yiFkkhWo'
};

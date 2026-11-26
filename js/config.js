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
 *
 * googleClientId: OAuth 2.0 client ID (type « Application Web ») used for
 * « Ouvrir depuis Google Drive » and for folders that are not shared
 * publicly. Authorised JavaScript origin: https://batex23.github.io
 * Scope requested: drive.readonly (read only). The Google Picker API must
 * be enabled on the project and allowed in the API key restrictions.
 */
window.FDS_VIEWER_CONFIG = {
    driveApiKey: 'AIzaSyA3l0KS7Uzd34B1cMB4DkgGyw2yiFkkhWo',
    // Dossier Drive public ouvert par « Simulation d’exemple »
    sampleDriveId: '1MM7QNyt_39qbZLpeIvcsNDT87uRBoTh7',
    googleClientId: '45950730270-jlpe535o31mfin6erpjtq0egll8ff7l0.apps.googleusercontent.com'
};

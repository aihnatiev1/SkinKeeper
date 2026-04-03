/**
 * NSFW / Safe-for-Work mode
 * When enabled, replaces all profile avatars and backgrounds with placeholders.
 * Great for streaming or working in public.
 */

const PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="184" height="184" viewBox="0 0 184 184">
    <rect width="184" height="184" fill="#1b2838"/>
    <text x="92" y="100" text-anchor="middle" fill="#4a5568" font-family="Arial" font-size="48" font-weight="bold">?</text>
  </svg>`
);

const SFW_CLASS = 'sk-sfw-active';

async function init() {
  const { sk_settings } = await chrome.storage.local.get('sk_settings');
  const nsfwEnabled = sk_settings?.nsfwMode ?? false;

  if (nsfwEnabled) {
    enableSFW();
  }

  // Listen for toggle changes from popup/options
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.sk_settings) {
      const newVal = changes.sk_settings.newValue?.nsfwMode ?? false;
      if (newVal) enableSFW();
      else disableSFW();
    }
  });
}

function enableSFW() {
  if (document.body.classList.contains(SFW_CLASS)) return;
  document.body.classList.add(SFW_CLASS);

  // Inject CSS to hide avatars and backgrounds
  let style = document.getElementById('sk-sfw-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'sk-sfw-style';
    style.textContent = `
      /* Profile backgrounds */
      .sk-sfw-active .profile_background_image_content,
      .sk-sfw-active .no_header.profile_page,
      .sk-sfw-active .profile_animated_background {
        background-image: none !important;
      }
      .sk-sfw-active .profile_background_image_content img,
      .sk-sfw-active .profile_animated_background video,
      .sk-sfw-active .profile_animated_background img {
        display: none !important;
      }

      /* Profile avatars — replace with placeholder */
      .sk-sfw-active .playerAvatarAutoSizeInner img,
      .sk-sfw-active .playerAvatar img,
      .sk-sfw-active .commentthread_author_avatar img,
      .sk-sfw-active .friends_header_avatar img,
      .sk-sfw-active .persona_name_text_content + .playerAvatar img,
      .sk-sfw-active .miniprofile_player_avatar img,
      .sk-sfw-active .avatar img {
        content: url("${PLACEHOLDER}") !important;
        object-fit: cover;
      }

      /* Profile header avatar specifically */
      .sk-sfw-active .profile_avatar_frame img,
      .sk-sfw-active .playerAvatarAutoSizeInner > img {
        content: url("${PLACEHOLDER}") !important;
      }

      /* Artwork/screenshots on profile */
      .sk-sfw-active .screenshot_holder img,
      .sk-sfw-active .profile_artwork img,
      .sk-sfw-active .apphub_CardContentMain img {
        filter: blur(20px);
      }

      /* Mini profiles on hover */
      .sk-sfw-active .miniprofile_playeravatar img {
        content: url("${PLACEHOLDER}") !important;
      }

      /* Profile showcase */
      .sk-sfw-active .profile_customization_header .showcase_content_bg img {
        filter: blur(20px);
      }
    `;
    document.head.appendChild(style);
  }
}

function disableSFW() {
  document.body.classList.remove(SFW_CLASS);
  document.getElementById('sk-sfw-style')?.remove();
}

init();

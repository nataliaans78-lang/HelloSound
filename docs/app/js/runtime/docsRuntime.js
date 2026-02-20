export function initDocsRuntime() {
const contactModal = document.getElementById('contactModal');
const successModal = document.getElementById('contactSuccessModal');
const contactForm = document.getElementById('contactForm');
const contactFormStatus = document.getElementById('contact-form-status');
const openContactButtons = document.querySelectorAll('[data-open-contact]');
const closeContactButtons = document.querySelectorAll('[data-close-contact]');
const closeSuccessButtons = document.querySelectorAll('[data-close-success]');
const contactSubmitButton = contactForm?.querySelector('button[type="submit"]');
const firstContactInput = contactModal?.querySelector('input[name="name"]');
const focusableSelector =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const modalOpeners = new WeakMap();
let activeModal = null;

function getModalFocusable(modal) {
  if (!modal) return [];
  return Array.from(modal.querySelectorAll(focusableSelector)).filter(
    el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
  );
}

function openModal(modal, opener = null, focusTarget = null) {
  if (!modal) return;
  if (activeModal && activeModal !== modal) {
    closeModal(activeModal, { returnFocus: false });
  }

  modalOpeners.set(modal, opener);
  activeModal = modal;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  requestAnimationFrame(() => {
    const fallback = getModalFocusable(modal)[0];
    (focusTarget || fallback)?.focus();
  });
}

function closeModal(modal, { returnFocus = true } = {}) {
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  if (activeModal === modal) {
    activeModal = null;
    document.body.classList.remove('modal-open');
  }

  if (!returnFocus) return;
  const opener = modalOpeners.get(modal);
  if (opener instanceof HTMLElement) {
    opener.focus();
  }
}

function openContactModal(opener = null) {
  openModal(contactModal, opener, firstContactInput);
}

function closeContactModal() {
  closeModal(contactModal);
}

function openSuccessModal(opener = null) {
  openModal(successModal, opener);
}

function closeSuccessModal() {
  closeModal(successModal);
}

function handleModalKeydown(event) {
  if (!activeModal?.classList.contains('is-open')) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal(activeModal);
    return;
  }

  if (event.key !== 'Tab') return;
  const focusable = getModalFocusable(activeModal);
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const activeElement = document.activeElement;

  if (event.shiftKey && (activeElement === first || !activeModal.contains(activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

openContactButtons.forEach(el => {
  el.addEventListener('click', event => {
    if (el.tagName === 'A') event.preventDefault();
    openContactModal(el);
  });
});

closeContactButtons.forEach(el => {
  el.addEventListener('click', closeContactModal);
});

closeSuccessButtons.forEach(el => {
  el.addEventListener('click', closeSuccessModal);
});

document.addEventListener('keydown', handleModalKeydown);

if (contactForm) {
  contactForm.addEventListener('submit', async event => {
    event.preventDefault();

    if (contactFormStatus) {
      contactFormStatus.textContent = '';
    }

    if (contactSubmitButton) {
      contactSubmitButton.disabled = true;
      contactSubmitButton.textContent = 'Sending...';
    }

    try {
      const response = await fetch(contactForm.action, {
        method: 'POST',
        body: new FormData(contactForm),
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Form submit failed');
      }

      contactForm.reset();
      closeContactModal();
      openSuccessModal();
    } catch (error) {
      if (contactFormStatus) {
        contactFormStatus.textContent = 'Could not send message. Please try again.';
      }
    } finally {
      if (contactSubmitButton) {
        contactSubmitButton.disabled = false;
        contactSubmitButton.textContent = 'Send';
      }
    }
  });
}

const demoVideo = document.getElementById('demoVideo');

if (demoVideo) {
  const demoSource = demoVideo.querySelector('source[data-src]');
  let isVideoLoaded = false;

  const safePlayVideo = () => {
    const playPromise = demoVideo.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  };

  const loadDemoVideo = () => {
    if (isVideoLoaded || !demoSource) return;
    const sourceUrl = demoSource.getAttribute('data-src');
    if (!sourceUrl) return;
    demoSource.src = sourceUrl;
    demoVideo.load();
    isVideoLoaded = true;
  };

  demoVideo.loop = true;
  demoVideo.muted = true;
  demoVideo.playsInline = true;
  demoVideo.setAttribute('webkit-playsinline', '');
  demoVideo.addEventListener('ended', () => {
    demoVideo.currentTime = 0;
    safePlayVideo();
  });

  if ('IntersectionObserver' in window) {
    const videoObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.target !== demoVideo) return;
          if (entry.isIntersecting) {
            loadDemoVideo();
            safePlayVideo();
          } else {
            demoVideo.pause();
          }
        });
      },
      {
        root: null,
        rootMargin: '200px 0px',
        threshold: 0.2
      }
    );

    videoObserver.observe(demoVideo);
  } else {
    loadDemoVideo();
    safePlayVideo();
  }
}


}


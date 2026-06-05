// ── account2fa.js — 2FA + Account management frontend logic ──────────────────

// ── Auth Page: form switching ─────────────────────────────────────────────────

(function initAuthForms() {
    function showAuthForm(id) {
        ['login-form', 'register-form', 'reset-password-form', 'totp-form'].forEach(f => {
            const el = document.getElementById(f);
            if (el) el.style.display = f === id ? '' : 'none';
        });
    }

    // "Forgot password?" link
    document.getElementById('link-forgot-password')?.addEventListener('click', e => {
        e.preventDefault();
        showAuthForm('reset-password-form');
    });

    // Back to login from reset form
    document.getElementById('link-reset-back-to-login')?.addEventListener('click', e => {
        e.preventDefault();
        showAuthForm('login-form');
    });

    // Back to login from TOTP step
    document.getElementById('link-totp-back-to-login')?.addEventListener('click', e => {
        e.preventDefault();
        showAuthForm('login-form');
        window._pendingLoginData = null;
    });

    // Reset password form submit
    document.getElementById('reset-password-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const username = document.getElementById('reset-username').value.trim();
        const totpCode = document.getElementById('reset-totp').value.trim();
        const backupCode = document.getElementById('reset-backup-code').value.trim();
        const newPassword = document.getElementById('reset-new-password').value;
        const confirmPassword = document.getElementById('reset-confirm-password').value;

        if (!username) return ui.toast('Username is required', 'error');
        if (!totpCode && !backupCode) return ui.toast('Enter an authenticator code or backup code', 'error');
        if (!newPassword) return ui.toast('New password is required', 'error');
        if (newPassword !== confirmPassword) return ui.toast("Passwords don't match", 'error');

        const btn = document.getElementById('reset-submit-btn');
        btn.disabled = true;
        btn.textContent = 'Resetting...';
        try {
            const body = { username, newPassword };
            if (totpCode) body.totpCode = totpCode;
            if (backupCode) body.backupCode = backupCode.toUpperCase();

            const r = await fetch('/api/auth/password-reset-with-totp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Reset failed');

            ui.toast(d.message || 'Password reset! Please log in.', 'success');
            document.getElementById('reset-totp').value = '';
            document.getElementById('reset-backup-code').value = '';
            document.getElementById('reset-new-password').value = '';
            document.getElementById('reset-confirm-password').value = '';
            showAuthForm('login-form');
        } catch (err) {
            ui.toast(err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Reset Password';
        }
    });
})();

// ── Auth Page: intercept login for 2FA step ───────────────────────────────────

document.getElementById('totp-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!window._pendingLoginData) {
        ui.toast('Session expired. Please log in again.', 'error');
        ['login-form', 'register-form', 'reset-password-form', 'totp-form'].forEach(f => {
            const el = document.getElementById(f);
            if (el) el.style.display = f === 'login-form' ? '' : 'none';
        });
        return;
    }
    const code = document.getElementById('totp-code').value.trim();
    if (!code) return ui.toast('Enter the 6-digit code', 'error');

    const btn = document.getElementById('totp-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Verifying...';

    try {
        const { username, password } = window._pendingLoginData;
        const r = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, totpCode: code })
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Invalid code');

        state.token = d.token;
        state.user = d.username;
        state.role = d.role;
        state.userId = String(d.userId);
        localStorage.setItem('mp_token', d.token);
        localStorage.setItem('mp_user', d.username);
        localStorage.setItem('mp_role', d.role);
        localStorage.setItem('mp_userid', String(d.userId));
        window._pendingLoginData = null;
        document.getElementById('totp-code').value = '';
        initDashboard();
    } catch (err) {
        ui.toast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Verify';
    }
});

// ── My Account view ────────────────────────────────────────────────────────────

document.getElementById('btn-my-account')?.addEventListener('click', () => {
    ui.showView('view-my-account');
    account2fa.loadStatus();
});

// Change password
document.getElementById('btn-change-password')?.addEventListener('click', async () => {
    const curPass = document.getElementById('acc-cur-pass').value;
    const newPass = document.getElementById('acc-new-pass').value;
    const confirmPass = document.getElementById('acc-confirm-pass').value;
    if (!curPass || !newPass || !confirmPass) return ui.toast('All fields are required', 'error');
    if (newPass !== confirmPass) return ui.toast("Passwords don't match", 'error');

    const btn = document.getElementById('btn-change-password');
    btn.disabled = true; btn.textContent = 'Updating...';
    try {
        await api.req('/users/me/password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword: curPass, newPassword: newPass })
        });
        ui.toast('Password updated!', 'success');
        document.getElementById('acc-cur-pass').value = '';
        document.getElementById('acc-new-pass').value = '';
        document.getElementById('acc-confirm-pass').value = '';
    } catch (err) {
        ui.toast(err.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Update Password';
    }
});

// ── account2fa module ─────────────────────────────────────────────────────────

const account2fa = {
    // Load status from server and update UI
    async loadStatus() {
        try {
            const d = await api.req('/auth/2fa/status');
            this.setStatus(d.configured, d.enabled);
        } catch (e) {
            console.warn('[2FA] Could not load status', e.message);
        }
    },

    // configured = authenticator app is set up
    // enabled    = 2FA is required at login
    setStatus(configured, enabled) {
        const unconfigured = document.getElementById('auth-app-unconfigured');
        const configuredEl = document.getElementById('auth-app-configured');
        const toggle = document.getElementById('toggle-2fa-login');

        if (unconfigured) unconfigured.style.display = configured ? 'none' : '';
        if (configuredEl) configuredEl.style.display = configured ? '' : 'none';

        // Set toggle state (only relevant when configured)
        if (toggle) {
            toggle.checked = !!enabled;
            // Avoid firing the change event programmatically
            toggle.dataset.loaded = '1';
        }
    }
};

// ── Open setup modal (Set Up Authenticator / Reconfigure) ─────────────────────

function _openSetupModal() {
    api.req('/auth/2fa/setup').then(d => {
        document.getElementById('2fa-qr-img').src = d.qrCode;
        document.getElementById('2fa-secret-display').textContent = d.secret;
        document.getElementById('2fa-setup-code').value = '';
        document.getElementById('2fa-step-qr').style.display = '';
        document.getElementById('2fa-step-backup').style.display = 'none';
        document.getElementById('2fa-setup-footer-verify').style.display = '';
        document.getElementById('2fa-setup-footer-done').style.display = 'none';
        ui.showModal('modal-2fa-setup');
    }).catch(err => ui.toast(err.message, 'error'));
}

document.getElementById('btn-setup-authenticator')?.addEventListener('click', _openSetupModal);
document.getElementById('btn-reconfigure-authenticator')?.addEventListener('click', _openSetupModal);

document.getElementById('modal-2fa-setup-close')?.addEventListener('click', () => ui.closeModals());
document.getElementById('modal-2fa-setup-cancel')?.addEventListener('click', () => ui.closeModals());

// Verify code → mark authenticator as configured, show backup codes
document.getElementById('btn-2fa-confirm')?.addEventListener('click', async () => {
    const code = document.getElementById('2fa-setup-code').value.trim();
    if (!code || code.length !== 6) return ui.toast('Enter the 6-digit code from your app', 'error');

    const btn = document.getElementById('btn-2fa-confirm');
    btn.disabled = true; btn.textContent = 'Verifying...';
    try {
        const d = await api.req('/auth/2fa/verify', {
            method: 'POST',
            body: JSON.stringify({ code })
        });
        _renderBackupCodes('2fa-backup-codes-grid', d.backupCodes);
        document.getElementById('2fa-step-qr').style.display = 'none';
        document.getElementById('2fa-step-backup').style.display = '';
        document.getElementById('2fa-setup-footer-verify').style.display = 'none';
        document.getElementById('2fa-setup-footer-done').style.display = '';
        // Authenticator is now configured; 2FA login enforcement stays as-is
        account2fa.setStatus(true, document.getElementById('toggle-2fa-login')?.checked || false);
        ui.toast('Authenticator configured!', 'success');
    } catch (err) {
        ui.toast(err.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Verify & Enable';
    }
});

document.getElementById('btn-copy-backup-codes')?.addEventListener('click', () => {
    const cells = document.querySelectorAll('#2fa-backup-codes-grid .backup-code-cell');
    const text = Array.from(cells).map(c => c.textContent).join('\n');
    navigator.clipboard.writeText(text).then(() => ui.toast('Backup codes copied!', 'success'));
});

document.getElementById('btn-2fa-setup-done')?.addEventListener('click', () => ui.closeModals());

// ── Toggle 2FA login enforcement ──────────────────────────────────────────────

document.getElementById('toggle-2fa-login')?.addEventListener('change', async function () {
    // Skip if this change was triggered programmatically during load
    if (this.dataset.loaded === '1') {
        delete this.dataset.loaded;
        return;
    }

    const enable = this.checked;
    const original = !enable; // rollback value
    this.disabled = true;

    try {
        await api.req('/auth/2fa/toggle', {
            method: 'POST',
            body: JSON.stringify({ enable })
        });
        ui.toast(enable ? '2FA login protection enabled' : '2FA login protection disabled', 'success');
    } catch (err) {
        // Rollback toggle on failure
        this.checked = original;
        ui.toast(err.message, 'error');
    } finally {
        this.disabled = false;
    }
});

// ── Remove Authenticator (was "Disable 2FA") ──────────────────────────────────

document.getElementById('btn-disable-2fa')?.addEventListener('click', () => {
    document.getElementById('2fa-disable-password').value = '';
    ui.showModal('modal-2fa-disable');
});

document.getElementById('modal-2fa-disable-close')?.addEventListener('click', () => ui.closeModals());
document.getElementById('modal-2fa-disable-cancel')?.addEventListener('click', () => ui.closeModals());

document.getElementById('btn-2fa-disable-confirm')?.addEventListener('click', async () => {
    const password = document.getElementById('2fa-disable-password').value;
    if (!password) return ui.toast('Password is required', 'error');

    const btn = document.getElementById('btn-2fa-disable-confirm');
    btn.disabled = true; btn.textContent = 'Removing...';
    try {
        await api.req('/auth/2fa/disable', {
            method: 'POST',
            body: JSON.stringify({ password })
        });
        ui.toast('Authenticator removed', 'success');
        ui.closeModals();
        account2fa.setStatus(false, false);
    } catch (err) {
        ui.toast(err.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Remove Authenticator';
    }
});

// ── View / Regenerate Backup Codes ────────────────────────────────────────────

document.getElementById('btn-view-backup-codes')?.addEventListener('click', () => {
    document.getElementById('backup-regen-code').value = '';
    document.getElementById('backup-regen-step').style.display = '';
    document.getElementById('backup-regen-result').style.display = 'none';
    document.getElementById('backup-regen-footer').style.display = '';
    document.getElementById('backup-regen-done-footer').style.display = 'none';
    ui.showModal('modal-2fa-backup-view');
});

document.getElementById('modal-2fa-backup-view-close')?.addEventListener('click', () => ui.closeModals());
document.getElementById('modal-2fa-backup-view-cancel')?.addEventListener('click', () => ui.closeModals());

document.getElementById('btn-backup-regen-confirm')?.addEventListener('click', async () => {
    const code = document.getElementById('backup-regen-code').value.trim();
    if (!code) return ui.toast('Enter your authenticator code', 'error');

    const btn = document.getElementById('btn-backup-regen-confirm');
    btn.disabled = true; btn.textContent = 'Generating...';
    try {
        const d = await api.req('/auth/2fa/regenerate-backup-codes', {
            method: 'POST',
            body: JSON.stringify({ code })
        });
        _renderBackupCodes('backup-regen-codes-grid', d.backupCodes);
        document.getElementById('backup-regen-step').style.display = 'none';
        document.getElementById('backup-regen-result').style.display = '';
        document.getElementById('backup-regen-footer').style.display = 'none';
        document.getElementById('backup-regen-done-footer').style.display = '';
    } catch (err) {
        ui.toast(err.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Generate New Codes';
    }
});

document.getElementById('btn-copy-regen-codes')?.addEventListener('click', () => {
    const cells = document.querySelectorAll('#backup-regen-codes-grid .backup-code-cell');
    const text = Array.from(cells).map(c => c.textContent).join('\n');
    navigator.clipboard.writeText(text).then(() => ui.toast('Codes copied!', 'success'));
});

document.getElementById('btn-backup-regen-done')?.addEventListener('click', () => ui.closeModals());

// ── Helper: render backup codes grid ─────────────────────────────────────────

function _renderBackupCodes(gridId, codes) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = '';
    codes.forEach(code => {
        const el = document.createElement('div');
        el.className = 'backup-code-cell';
        el.textContent = code;
        el.style.cssText = 'padding:0.4rem 0.6rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:0.85rem;color:var(--accent);text-align:center;';
        grid.appendChild(el);
    });
}

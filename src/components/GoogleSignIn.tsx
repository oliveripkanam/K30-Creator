import React from 'react';
import { supabase } from '../lib/supabase';

declare global {
  interface Window {
    google?: any;
  }
}

interface GoogleSignInProps {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
  className?: string;
}

export function GoogleSignIn({ onSuccess, onError, className }: GoogleSignInProps) {
  const divRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId) {
      console.error('VITE_GOOGLE_CLIENT_ID is not set');
      return;
    }

    const init = () => {
      try {
        const nonce = crypto.randomUUID();
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: { credential: string }) => {
            try {
              const { data, error } = await supabase.auth.signInWithIdToken({
                provider: 'google',
                token: response.credential,
                nonce,
              });
              if (error) throw error;
              if (data?.user) {
                onSuccess?.();
              }
            } catch (e) {
              console.error('Google ID token exchange failed', e);
              onError?.(e);
            }
          },
          nonce,
        });

        if (divRef.current) {
          const container = divRef.current;
          const containerWidth = Math.min(380, Math.max(240, container.offsetWidth || 320));
          window.google.accounts.id.renderButton(container, {
            theme: 'filled_blue',
            size: 'large',
            width: containerWidth,
            type: 'standard',
            shape: 'rectangular',
            text: 'continue_with',
            logo_alignment: 'left',
          });
        }
      } catch (e) {
        console.error('Failed to initialize Google Identity Services', e);
      }
    };

    if (window.google?.accounts?.id) {
      init();
    } else {
      const t = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(t);
          init();
        }
      }, 100);
      return () => clearInterval(t);
    }
  }, [onSuccess, onError]);

  return <div ref={divRef} className={className} />;
}



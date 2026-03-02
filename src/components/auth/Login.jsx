import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../../api/supabaseClient';

export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-6 text-center">
          Cabinetry Designer
        </h1>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          theme="dark"
          providers={[]}
        />
      </div>
    </div>
  );
}

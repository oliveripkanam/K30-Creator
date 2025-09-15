import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Separator } from './ui/separator';
import { GoogleSignIn } from './GoogleSignIn';

interface LoginPageProps {
  onLogin: (provider: 'apple' | 'microsoft' | 'google') => void;
  onOAuth?: (provider: 'google' | 'azure' | 'apple') => void;
}

export function LoginPage({ onLogin, onOAuth }: LoginPageProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 48 48" strokeWidth="1.5">
              {/* Opened box at bottom - larger size */}
              <g>
                {/* Box base */}
                <rect x="8" y="30" width="32" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round"/>
                
                {/* Box flaps - opened outward */}
                <path d="M8 30 L4 26 L8 26" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M40 30 L44 26 L40 26" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M24 30 L24 24 L20 24" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M24 30 L24 24 L28 24" strokeLinecap="round" strokeLinejoin="round"/>
              </g>
              
              {/* Brain outline - larger and positioned on top of opened box */}
              <path 
                d="M12 30c0-3 2-6 4-7 2-3 4-4 8-4s6 1 8 4c2 1 4 4 4 7 0 1.5-0.5 3-1 4 0.5 1.5 1 2.5 1 4 0 3-2 6-4 7-1.5 1.5-3 1.5-4.5 1.5-1.5 3-4.5 4.5-7.5 4.5s-6-1.5-7.5-4.5c-1.5 0-3 0-4.5-1.5-2-1-4-4-4-7 0-1.5 0.5-2.5 1-4-0.5-1-1-2.5-1-4z" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
              
              {/* Brain details - left hemisphere curves */}
              <path 
                d="M16 22c2-1.5 3-1.5 4.5 0" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
              <path 
                d="M14 28c2-1 3-1 4.5 0" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
              <path 
                d="M15 34c1.5-0.5 2.5-0.5 4 0" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
              
              {/* Brain details - right hemisphere curves */}
              <path 
                d="M27.5 22c2-1.5 3-1.5 4.5 0" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
              <path 
                d="M29.5 28c2-1 3-1 4.5 0" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
              <path 
                d="M29 34c1.5-0.5 2.5-0.5 4 0" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
              
              {/* Brain division line */}
              <path 
                d="M24 20 L24 38" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                opacity="0.4"
              />
              
              {/* AI text inside brain - larger */}
              <text x="24" y="30" textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="bold" fill="currentColor" stroke="none">
                AI
              </text>
            </svg>
          </div>
          <CardTitle className="text-2xl">AI Maths Decoder</CardTitle>
          <CardDescription>
            AI-powered breakdown of complex mechanics problems into step-by-step solutions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <GoogleSignIn className="w-full flex justify-center" />

          <Button 
            className="w-full h-12" 
            variant="outline"
            onClick={() => (onOAuth ? onOAuth('azure') : onLogin('microsoft'))}
          >
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
              <path fill="#F25022" d="M11.4 11.4H2V2h9.4v9.4z"/>
              <path fill="#7FBA00" d="M22 11.4h-9.4V2H22v9.4z"/>
              <path fill="#00A4EF" d="M11.4 22H2v-9.4h9.4V22z"/>
              <path fill="#FFB900" d="M22 22h-9.4v-9.4H22V22z"/>
            </svg>
            Continue with Microsoft
          </Button>

          <Button 
            className="w-full h-12" 
            variant="outline"
            onClick={() => onLogin('apple')}
          >
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            Continue with Apple
          </Button>

          <Separator className="my-6" />

          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              By continuing, you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
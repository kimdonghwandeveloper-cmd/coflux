import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Github, CreditCard, Zap } from 'lucide-react';
import { UserProfile, supabase } from '../../lib/supabase';
import { FeatureItem } from './FeatureItem';

export function AccountTab({ user }: { user: UserProfile | null }) {
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [isSendingLink, setIsSendingLink] = useState(false);

  const handleSocialLogin = async (provider: 'google' | 'github') => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: 'coflux://auth', // 데스크톱 앱 딥링크
        }
      });
      if (error) throw error;
    } catch (e) {
      alert(`${provider} 로그인 실패: ` + e);
    }
  };

  const handleMagicLinkLogin = async () => {
    setShowLoginPrompt(true);
  };

  const submitMagicLink = async () => {
    if (!loginEmail.trim()) {
      alert('이메일 주소를 입력해주세요.');
      return;
    }
    
    setIsSendingLink(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ 
        email: loginEmail,
        options: {
          emailRedirectTo: 'coflux://auth', 
        }
      });
      if (error) {
        alert('로그인 요청 실패: ' + error.message);
      } else {
        alert('로그인 링크가 이메일로 전송되었습니다. (받은 편지함을 확인해주세요)');
        setShowLoginPrompt(false);
        setLoginEmail('');
      }
    } catch (e) {
      alert('오류 발생: ' + e);
    } finally {
      setIsSendingLink(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleUpgrade = async () => {
    try {
      if (!user) {
        alert('로그인이 필요한 서비스입니다.');
        return;
      }
      
      const url = await invoke<string>('coflux_create_checkout_session', { email: user.email });
      window.open(url, '_blank');
    } catch (e) {
      alert('결제 세션 생성 실패: ' + e);
    }
  };

  const handleManageBilling = async () => {
    try {
      if (!user?.stripe_customer_id) {
        alert('빌링 정보가 없습니다. 고객 센터에 문의해주세요.');
        return;
      }
      const url = await invoke<string>('coflux_open_billing_portal', { customerId: user.stripe_customer_id });
      window.open(url, '_blank');
    } catch (e) {
      alert('빌링 포털 오픈 실패: ' + e);
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>Account & Subscription</h3>
      
      <div style={{ padding: '20px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '20px', fontWeight: 600 }}>
              {user.email?.[0].toUpperCase() || 'U'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{user.email}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>ID: {user.id.slice(0, 8)}...</div>
            </div>
            <button onClick={handleLogout} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', fontSize: '12px', cursor: 'pointer' }}>Logout</button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>로그인하여 기기 간 동기화 및 Pro 기능을 사용하세요.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '280px', margin: '0 auto' }}>
              <button 
                onClick={() => handleSocialLogin('google')}
                style={{ width: '100%', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'white', color: '#333', fontWeight: 600, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/><path d="M1 1h22v22H1z" fill="none"/></svg>
                Continue with Google
              </button>
              
              <button 
                onClick={() => handleSocialLogin('github')}
                style={{ width: '100%', padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#24292e', color: 'white', fontWeight: 600, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
              >
                <Github size={18} /> Continue with GitHub
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0' }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>or</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
              </div>

              <button 
                onClick={handleMagicLinkLogin}
                style={{ width: '100%', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontWeight: 500, fontSize: '13px', cursor: 'pointer' }}
              >
                Email Magic Link
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '20px', background: 'linear-gradient(135deg, var(--bg-surface) 0%, var(--bg-secondary) 100%)', borderRadius: '12px', border: '1px solid var(--border-color)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CreditCard size={12} /> Current Plan
              </span>
              <h4 style={{ margin: '4px 0', fontSize: '20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                {user?.tier === 'pro' ? 'CoFlux Pro' : 'Free Plan'}
                {user?.tier === 'pro' && <Zap size={18} fill="currentColor" />}
              </h4>
            </div>
            {user?.tier === 'pro' ? (
              <button 
                onClick={handleManageBilling}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
              >
                Manage
              </button>
            ) : (
              <button 
                onClick={handleUpgrade}
                style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--text-primary)', color: 'var(--bg-primary)', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
              >
                Upgrade
              </button>
            )}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
            {user?.tier === 'pro' 
              ? '모든 프리미엄 기능을 사용 중입니다. 무제한 AI 질문과 클라우드 동기화가 활성화되어 있습니다.' 
              : '기본 기능을 무료로 이용 중입니다. Pro로 업그레이드하여 더 강력한 AI와 클라우드 동기화를 경험하세요.'}
          </p>
        </div>
      </div>

      <div style={{ marginTop: '24px' }}>
        <h4 style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', paddingLeft: '4px' }}>Plan Comparison</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)' }}>Free</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 } as any}>
              <FeatureItem text="기본 AI 모델 이용" active />
              <FeatureItem text="로컬 데이터 저장" active />
              <FeatureItem text="클라우드 동기화" active={false} />
              <FeatureItem text="무제한 AI 질문" active={false} />
            </ul>
          </div>
          <div style={{ padding: '16px', background: 'rgba(var(--accent-rgb), 0.05)', borderRadius: '12px', border: '1px solid var(--accent)', position: 'relative' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              Pro <Zap size={12} fill="currentColor" />
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 } as any}>
              <FeatureItem text="최신 고급 AI 모델" active />
              <FeatureItem text="실시간 클라우드 동기화" active />
              <FeatureItem text="무제한 AI 질문 & 컨텍스트" active />
              <FeatureItem text="우선 순위 지원" active />
            </ul>
          </div>
        </div>
      </div>

      {showLoginPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.2s ease-out' }}>
          <div style={{ background: 'var(--bg-primary)', borderRadius: '16px', width: '400px', padding: '32px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '20px', animation: 'slideUpFade 0.2s ease-out forwards' }}>
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>CoFlux 로그인</h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                매직 링크를 받을 이메일 주소를 입력해주세요.<br/>비밀번호 없이 안전하게 로그인할 수 있습니다.
              </p>
            </div>
            
            <input 
              type="email" 
              placeholder="name@example.com" 
              autoFocus
              value={loginEmail}
              onChange={e => setLoginEmail(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submitMagicLink();
                if (e.key === 'Escape') setShowLoginPrompt(false);
              }}
              style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '15px', outline: 'none', transition: 'border 0.2s' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button 
                onClick={() => setShowLoginPrompt(false)}
                disabled={isSendingLink}
                style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
              >
                취소
              </button>
              <button 
                onClick={submitMagicLink}
                disabled={isSendingLink || !loginEmail.trim()}
                style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: 'var(--text-primary)', color: 'var(--bg-primary)', fontSize: '14px', fontWeight: 600, cursor: (isSendingLink || !loginEmail.trim()) ? 'not-allowed' : 'pointer', opacity: (isSendingLink || !loginEmail.trim()) ? 0.5 : 1 }}
              >
                {isSendingLink ? '전송 중...' : '계속하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

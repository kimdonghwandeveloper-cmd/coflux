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
    const email = user?.email;
    if (!email || !email.includes('@')) {
      alert('로그인이 필요하거나 이메일 정보가 없습니다.');
      return;
    }

    try {
      // invokes the rust command to create a Stripe/External checkout session
      const url = await invoke<string>('coflux_create_checkout_session', { email });
      window.open(url, '_blank');
    } catch (e) {
      console.error('Checkout failed:', e);
      alert('결제 페이지를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
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
    <div style={{ animation: 'fadeIn 0.2s ease-out', paddingBottom: '20px' }}>
      <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '20px' }}>CoFlux Subscription</h3>
      
      {/* 1. Pro Upgrade Section (Login Required) */}
      <div style={{ 
        padding: '28px', 
        background: 'linear-gradient(145deg, var(--bg-surface) 0%, var(--bg-secondary) 100%)', 
        borderRadius: '16px', 
        border: user?.tier === 'pro' ? '1px solid var(--accent)' : '1px solid var(--border-color)', 
        position: 'relative', 
        overflow: 'hidden',
        boxShadow: user?.tier === 'pro' ? '0 8px 32px rgba(var(--accent-rgb), 0.1)' : 'none'
      }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                 <div style={{ background: 'var(--accent)', color: 'white', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }}>Most Popular</div>
                 {user?.tier === 'pro' && <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>장착됨</span>}
              </div>
              <h4 style={{ margin: '0', fontSize: '24px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
                CoFlux Pro
                <Zap size={22} fill="var(--accent)" color="var(--accent)" />
              </h4>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                $12.99 / <span style={{ opacity: 0.7 }}>평생 소장</span>
              </div>
            </div>
            
            <div style={{ textAlign: 'right' }}>
               <CreditCard size={32} style={{ opacity: 0.1 }} />
            </div>
          </div>

          <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.6', marginBottom: '24px', opacity: 0.9 }}>
             한 번의 결제로 무제한 AI 답변, 고급 지식 그래프 시각화, 지능형 워크플로우를 모두 해금하세요.
          </p>

          {!user ? (
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px dotted var(--border-color)', textAlign: 'center' }}>
               <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                 업그레이드를 진행하려면 먼저 로그인이 필요합니다.
               </p>
               <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                 <button onClick={() => handleSocialLogin('google')} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                   <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                   Google
                 </button>
                 <button onClick={() => handleSocialLogin('github')} style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#24292e', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                   <Github size={16} />
                   GitHub
                 </button>
               </div>
            </div>
          ) : user.tier !== 'pro' ? (
            <div style={{ background: 'rgba(var(--accent-rgb), 0.05)', padding: '20px', borderRadius: '12px', border: '1px solid var(--accent)' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <div>
                   <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>결제 계정</label>
                   <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{user.email}</div>
                 </div>
                 <button 
                    onClick={handleUpgrade}
                    style={{ 
                      padding: '12px 24px', 
                      borderRadius: '8px', 
                      border: 'none', 
                      background: 'var(--accent)', 
                      color: 'white', 
                      fontWeight: 700, 
                      fontSize: '14px', 
                      cursor: 'pointer',
                      transition: 'transform 0.1s',
                      boxShadow: '0 4px 12px rgba(var(--accent-rgb), 0.3)'
                    }}
                    onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
                    onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    지금 업그레이드
                  </button>
               </div>
               <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px', opacity: 0.7 }}>
                 * 현재 로그인된 계정으로 라이선스가 발급됩니다.
               </p>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '10px' }}>
               <button 
                onClick={handleManageBilling}
                style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
              >
                결제 관리
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--accent)', fontWeight: 600 }}>
                 <Zap size={14} fill="currentColor" /> Pro 기능을 마음껏 즐기고 계십니다!
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Login/Sync Section (Secondary) */}
      <div style={{ marginTop: '32px' }}>
        <h4 style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px', paddingLeft: '4px' }}>기존 구매 정보 복구 또는 동기화</h4>
        <div style={{ padding: '20px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
             <div style={{ fontSize: '14px', fontWeight: 600 }}>{user ? `접속됨: ${user.email}` : '로그인이 필요하신가요?'}</div>
             <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>기기 간 데이터 동기화가 필요한 경우만 권장합니다.</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
             {user ? (
               <button onClick={handleLogout} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', fontSize: '13px', cursor: 'pointer' }}>로그아웃</button>
             ) : (
               <>
                 <button onClick={() => handleSocialLogin('google')} title="Google로 로그인" style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'white', cursor: 'pointer', display: 'flex' }}><svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/><path d="M1 1h22v22H1z" fill="none"/></svg></button>
                 <button onClick={() => handleSocialLogin('github')} title="GitHub로 로그인" style={{ padding: '10px', borderRadius: '8px', border: 'none', background: '#24292e', color: 'white', cursor: 'pointer', display: 'flex' }}><Github size={18} /></button>
                 <button onClick={handleMagicLinkLogin} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}>매직 링크</button>
               </>
             )}
          </div>
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

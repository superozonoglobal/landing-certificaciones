import React from 'react';

export default function LoginPage() {
    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: '20px' }}>
            <div className="premium-card" style={{ width: '400px', textAlign: 'center' }}>
                <h1 className="gradient-text" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Iniciar Sesión</h1>
                <p style={{ color: 'var(--gray)', marginBottom: '2rem' }}>Ingresa a la plataforma Super Ozono</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <input type="email" placeholder="Email" style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }} />
                    <input type="password" placeholder="Contraseña" style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }} />
                    <button style={{ padding: '12px', borderRadius: '8px', background: 'var(--primary)', color: '#fff', fontWeight: 'bold' }}>Entrar</button>
                </div>
            </div>
        </div>
    );
}

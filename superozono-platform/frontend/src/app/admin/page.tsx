import React from 'react';

export default function Page() {
  return (
    <div style={{ padding: '3rem', minHeight: '100vh' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 className="gradient-text" style={{ fontSize: '3rem', fontWeight: 900 }}>ADMIN</h1>
        <p style={{ color: 'var(--gray)', fontSize: '1.2rem' }}>Módulo de la plataforma Super Ozono</p>
      </header>
      
      <div className="premium-card">
        <h2 style={{ marginBottom: '1.5rem' }}>Vista en Construcción</h2>
        <p style={{ opacity: 0.8, lineHeight: 1.6 }}>
          Esta es la página principal del módulo: <strong>admin</strong>. 
          Aquí se integrará la lógica de negocio y los componentes específicos.
        </p>
        <div style={{ marginTop: '2.5rem', display: 'flex', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px dashed var(--border)', flex: 1 }}>
             <small style={{ color: 'var(--primary)', fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>LOGICA PENDIENTE</small>
             Status: Esperando implementación
          </div>
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px dashed var(--border)', flex: 1 }}>
             <small style={{ color: 'var(--primary)', fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>ENDPOINT API</small>
             Status: /api/admin
          </div>
        </div>
      </div>
    </div>
  );
}
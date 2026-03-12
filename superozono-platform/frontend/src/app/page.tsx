import React from 'react';

export default function HomePage() {
    return (
        <main style={{ padding: '2rem', textAlign: 'center' }}>
            <h1>Super Ozono Platform</h1>
            <p>Bienvenido al frontend profesional de Super Ozono</p>
            <div style={{ marginTop: '2rem' }}>
                <a href="/login" style={{ marginRight: '1rem' }}>Login</a>
                <a href="/dashboard">Dashboard</a>
            </div>
        </main>
    );
}

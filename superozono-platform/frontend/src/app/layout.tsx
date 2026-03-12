import type { Metadata } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
    title: 'Super Ozono Platform',
    description: 'Gestión profesional de ozono y purificación de agua',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es">
            <body>{children}</body>
        </html>
    );
}

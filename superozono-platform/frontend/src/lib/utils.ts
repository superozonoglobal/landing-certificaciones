export const clsx = (...classes: (string | undefined | null | boolean)[]) => {
    return classes.filter(Boolean).join(' ');
};

export const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(date);
};

export const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
    }).format(amount);
};

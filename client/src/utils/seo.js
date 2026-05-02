const DEFAULTS = {
    title: 'Mis Gastos - Control Personal',
    description: 'Registrá gastos, analizá tus finanzas y tomá decisiones con claridad.',
    image: '/icon-192.svg'
};

const setMeta = (attr, name, content) => {
    if (!content) return;
    let tag = document.querySelector(`meta[${attr}="${name}"]`);
    if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attr, name);
        document.head.appendChild(tag);
    }
    tag.setAttribute('content', content);
};

const setLink = (rel, href) => {
    if (!href) return;
    let tag = document.querySelector(`link[rel="${rel}"]`);
    if (!tag) {
        tag = document.createElement('link');
        tag.setAttribute('rel', rel);
        document.head.appendChild(tag);
    }
    tag.setAttribute('href', href);
};

// Centraliza el seteo de etiquetas SEO/OG para cada ruta.
export const setSeo = ({ title, description, image, url } = {}) => {
    const finalTitle = title || DEFAULTS.title;
    const finalDescription = description || DEFAULTS.description;
    const finalImage = image || DEFAULTS.image;
    const finalUrl = url || window.location.href;

    document.title = finalTitle;

    setMeta('name', 'description', finalDescription);
    setMeta('name', 'robots', 'index,follow');

    setMeta('property', 'og:title', finalTitle);
    setMeta('property', 'og:description', finalDescription);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:image', finalImage);
    setMeta('property', 'og:url', finalUrl);

    setMeta('name', 'twitter:card', 'summary');
    setMeta('name', 'twitter:title', finalTitle);
    setMeta('name', 'twitter:description', finalDescription);
    setMeta('name', 'twitter:image', finalImage);

    setLink('canonical', finalUrl);
};

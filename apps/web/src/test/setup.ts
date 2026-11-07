import '@testing-library/jest-dom/vitest';

// O jsdom não implementa scrollIntoView (o chat rola para a última mensagem).
Element.prototype.scrollIntoView = () => undefined;

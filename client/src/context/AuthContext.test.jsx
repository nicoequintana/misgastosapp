/**
 * Tests de caracterización para AuthContext — documentan el comportamiento
 * ACTUAL del provider (no son tests de una feature nueva). AuthContext ya
 * existía sin cobertura; estos tests fijan el contrato real antes de tocar
 * el archivo en el futuro, siguiendo el mismo criterio usado en
 * client/src/lib/db.grupos.test.js.
 *
 * Se mockea únicamente la capa `./supabase` (SDK), igual que en
 * db.createExpense.test.js / db.grupos.test.js — nunca la lógica del propio
 * AuthContext.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { useAuth, AuthProvider } from './AuthContext';

const mockOnAuthStateChange = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockSignOut = vi.fn();
const mockUnsubscribe = vi.fn();

vi.mock('../lib/supabase', () => ({
    supabase: {
        auth: {
            onAuthStateChange: (...args) => mockOnAuthStateChange(...args),
            signInWithOAuth: (...args) => mockSignInWithOAuth(...args),
            signOut: (...args) => mockSignOut(...args),
        },
    },
}));

// Componente de prueba que expone el valor del contexto en el DOM para poder
// aserirlo con testing-library sin reimplementar un consumidor real.
const ConsumidorDePrueba = () => {
    const { user, session, loading, signOut, signInWithGoogle } = useAuth();
    return (
        <div>
            <span data-testid="loading">{String(loading)}</span>
            <span data-testid="user">{user ? user.id : 'null'}</span>
            <span data-testid="session">{session ? 'presente' : 'null'}</span>
            <button onClick={() => signOut()}>Cerrar sesión</button>
            <button onClick={() => signInWithGoogle()}>Iniciar sesión con Google</button>
        </div>
    );
};

describe('AuthProvider — estado inicial', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: mockUnsubscribe } } });
    });

    it('arranca con loading=true antes de que Supabase emita INITIAL_SESSION', () => {
        // No invocamos el callback todavía — simula el instante entre el montaje
        // y la primera emisión del listener de Supabase.
        render(
            <AuthProvider>
                <ConsumidorDePrueba />
            </AuthProvider>
        );

        expect(screen.getByTestId('loading')).toHaveTextContent('true');
        expect(screen.getByTestId('user')).toHaveTextContent('null');
        expect(screen.getByTestId('session')).toHaveTextContent('null');
    });

    it('resuelve loading=false y setea user/session cuando INITIAL_SESSION trae una sesión activa', async () => {
        const sesionFake = { access_token: 'jwt-fake', user: { id: 'user-123' } };
        mockOnAuthStateChange.mockImplementation((callback) => {
            // Simula el comportamiento real del SDK: invoca el callback de forma
            // asíncrona (microtask) con el evento INITIAL_SESSION al suscribirse.
            Promise.resolve().then(() => callback('INITIAL_SESSION', sesionFake));
            return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
        });

        render(
            <AuthProvider>
                <ConsumidorDePrueba />
            </AuthProvider>
        );

        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
        expect(screen.getByTestId('user')).toHaveTextContent('user-123');
        expect(screen.getByTestId('session')).toHaveTextContent('presente');
    });

    it('resuelve loading=false con user/session=null cuando INITIAL_SESSION no trae sesión', async () => {
        mockOnAuthStateChange.mockImplementation((callback) => {
            Promise.resolve().then(() => callback('INITIAL_SESSION', null));
            return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
        });

        render(
            <AuthProvider>
                <ConsumidorDePrueba />
            </AuthProvider>
        );

        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
        expect(screen.getByTestId('user')).toHaveTextContent('null');
        expect(screen.getByTestId('session')).toHaveTextContent('null');
    });
});

describe('AuthProvider — cambios de evento posteriores', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('actualiza user/session cuando el listener emite SIGNED_IN después del estado inicial', async () => {
        let emitirEvento;
        mockOnAuthStateChange.mockImplementation((callback) => {
            emitirEvento = callback;
            Promise.resolve().then(() => callback('INITIAL_SESSION', null));
            return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
        });

        render(
            <AuthProvider>
                <ConsumidorDePrueba />
            </AuthProvider>
        );
        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
        expect(screen.getByTestId('user')).toHaveTextContent('null');

        const sesionFake = { access_token: 'jwt-login', user: { id: 'user-456' } };
        emitirEvento('SIGNED_IN', sesionFake);

        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('user-456'));
        expect(screen.getByTestId('session')).toHaveTextContent('presente');
    });

    it('limpia user/session cuando el listener emite SIGNED_OUT tras una sesión activa', async () => {
        let emitirEvento;
        const sesionFake = { access_token: 'jwt-login', user: { id: 'user-789' } };
        mockOnAuthStateChange.mockImplementation((callback) => {
            emitirEvento = callback;
            Promise.resolve().then(() => callback('INITIAL_SESSION', sesionFake));
            return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
        });

        render(
            <AuthProvider>
                <ConsumidorDePrueba />
            </AuthProvider>
        );
        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('user-789'));

        emitirEvento('SIGNED_OUT', null);

        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('null'));
        expect(screen.getByTestId('session')).toHaveTextContent('null');
    });
});

describe('AuthProvider — signOut', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: mockUnsubscribe } } });
    });

    it('llama a supabase.auth.signOut con scope "global" (regla CLAUDE.md #9)', async () => {
        mockSignOut.mockResolvedValue({ error: null });

        render(
            <AuthProvider>
                <ConsumidorDePrueba />
            </AuthProvider>
        );

        fireEvent.click(screen.getByText('Cerrar sesión'));

        await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ scope: 'global' }));
    });

    it('relanza el error y NO limpia user/session cuando signOut falla', async () => {
        const sesionFake = { access_token: 'jwt-login', user: { id: 'user-error' } };
        mockOnAuthStateChange.mockImplementation((callback) => {
            Promise.resolve().then(() => callback('INITIAL_SESSION', sesionFake));
            return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
        });
        const errorFake = new Error('Network error');
        mockSignOut.mockResolvedValue({ error: errorFake });
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const ConsumidorConCaptura = () => {
            const { user, signOut } = useAuth();
            return (
                <div>
                    <span data-testid="user">{user ? user.id : 'null'}</span>
                    <button onClick={() => signOut().catch(() => {})}>Cerrar sesión</button>
                </div>
            );
        };

        render(
            <AuthProvider>
                <ConsumidorConCaptura />
            </AuthProvider>
        );
        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('user-error'));

        fireEvent.click(screen.getByText('Cerrar sesión'));

        await waitFor(() => expect(consoleErrorSpy).toHaveBeenCalledWith(
            '❌ Error al cerrar sesión:', errorFake.message
        ));
        // El estado local NO se limpia si Supabase devuelve error — el usuario sigue autenticado.
        expect(screen.getByTestId('user')).toHaveTextContent('user-error');
        consoleErrorSpy.mockRestore();
    });

    it('limpia user/session localmente después de un signOut exitoso', async () => {
        const sesionFake = { access_token: 'jwt-login', user: { id: 'user-999' } };
        mockOnAuthStateChange.mockImplementation((callback) => {
            Promise.resolve().then(() => callback('INITIAL_SESSION', sesionFake));
            return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
        });
        mockSignOut.mockResolvedValue({ error: null });

        render(
            <AuthProvider>
                <ConsumidorDePrueba />
            </AuthProvider>
        );
        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('user-999'));

        fireEvent.click(screen.getByText('Cerrar sesión'));

        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('null'));
        expect(screen.getByTestId('session')).toHaveTextContent('null');
    });
});

describe('AuthProvider — signInWithGoogle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: mockUnsubscribe } } });
    });

    it('llama a supabase.auth.signInWithOAuth con provider google', async () => {
        mockSignInWithOAuth.mockResolvedValue({ error: null });

        render(
            <AuthProvider>
                <ConsumidorDePrueba />
            </AuthProvider>
        );

        fireEvent.click(screen.getByText('Iniciar sesión con Google'));

        await waitFor(() => expect(mockSignInWithOAuth).toHaveBeenCalledWith(
            expect.objectContaining({ provider: 'google' })
        ));
    });

    it('relanza el error cuando signInWithOAuth falla', async () => {
        const errorFake = new Error('OAuth no disponible');
        mockSignInWithOAuth.mockResolvedValue({ error: errorFake });
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const ConsumidorConCaptura = () => {
            const { signInWithGoogle } = useAuth();
            return (
                <button onClick={() => signInWithGoogle().catch(() => {})}>
                    Iniciar sesión con Google
                </button>
            );
        };

        render(
            <AuthProvider>
                <ConsumidorConCaptura />
            </AuthProvider>
        );

        fireEvent.click(screen.getByText('Iniciar sesión con Google'));

        await waitFor(() => expect(consoleErrorSpy).toHaveBeenCalledWith(
            '❌ Error al iniciar sesión con Google:', errorFake.message
        ));
        consoleErrorSpy.mockRestore();
    });
});

describe('AuthProvider — cleanup del listener', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: mockUnsubscribe } } });
    });

    it('desuscribe el listener de onAuthStateChange al desmontar (evita fugas de memoria)', () => {
        const { unmount } = render(
            <AuthProvider>
                <ConsumidorDePrueba />
            </AuthProvider>
        );

        expect(mockUnsubscribe).not.toHaveBeenCalled();

        unmount();

        expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });
});

describe('AuthProvider — redirección por invitación pendiente', () => {
    const TOKEN_VALIDO = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    let replaceSpy;

    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        // jsdom no implementa window.location.replace; se reemplaza por un spy
        // para poder verificar la URL sin navegar de verdad.
        replaceSpy = vi.fn();
        vi.stubGlobal('location', { ...window.location, replace: replaceSpy });
    });

    it('redirige a la invitación cuando SIGNED_IN llega con un token pendiente válido en sessionStorage', async () => {
        sessionStorage.setItem('pending_invitation_token', TOKEN_VALIDO);
        mockOnAuthStateChange.mockImplementation((callback) => {
            Promise.resolve().then(() => callback('SIGNED_IN', { user: { id: 'user-1' } }));
            return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
        });

        render(
            <AuthProvider>
                <ConsumidorDePrueba />
            </AuthProvider>
        );

        await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith(`/grupos/invitaciones/${TOKEN_VALIDO}`));
        expect(sessionStorage.getItem('pending_invitation_token')).toBeNull();
    });

    it('no redirige y limpia el token cuando el token pendiente no es un UUID válido', async () => {
        sessionStorage.setItem('pending_invitation_token', 'token-invalido');
        mockOnAuthStateChange.mockImplementation((callback) => {
            Promise.resolve().then(() => callback('SIGNED_IN', { user: { id: 'user-1' } }));
            return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
        });

        render(
            <AuthProvider>
                <ConsumidorDePrueba />
            </AuthProvider>
        );

        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('user-1'));
        expect(replaceSpy).not.toHaveBeenCalled();
        expect(sessionStorage.getItem('pending_invitation_token')).toBeNull();
    });

    it('no redirige cuando SIGNED_IN llega sin token pendiente en sessionStorage', async () => {
        mockOnAuthStateChange.mockImplementation((callback) => {
            Promise.resolve().then(() => callback('SIGNED_IN', { user: { id: 'user-1' } }));
            return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
        });

        render(
            <AuthProvider>
                <ConsumidorDePrueba />
            </AuthProvider>
        );

        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('user-1'));
        expect(replaceSpy).not.toHaveBeenCalled();
    });
});

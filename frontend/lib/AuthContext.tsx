"use client"

import { createContext, useEffect, useState, useContext } from "react"

interface AuthContextType {
    user: any;
    login: (email: string, password: string) => Promise<any>;
    logout: () => void;
    loading: boolean;
}

// TODO: Implement refresh tokens

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const apiCall = async (url: string, options: RequestInit = {}) => {
        return fetch(url, {
            ...options,
            credentials: 'include', // Include cookies
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            }
        });
    }

    useEffect(() => {
        apiCall("http://localhost:3001/api/auth/me").then(res => res.json()).then(data => {
            if (data.user) {
                setUser(data.user)
            }
        })
            .catch(err => {
                console.log(err)
            })
            .finally(() => {
                setLoading(false)
            })
    }, [])

    const login = async (email: string, password: string) => {
        const res = await apiCall("http://localhost:3001/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.user) setUser(data.user);
        return data;
    };

    const logout = async () => {
        await apiCall("http://localhost:3001/api/auth/logout", { method: "POST" });
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    )


}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;

}
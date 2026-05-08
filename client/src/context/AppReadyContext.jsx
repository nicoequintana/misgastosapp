import React, { createContext, useContext, useState } from 'react';

const AppReadyContext = createContext({});

export const AppReadyProvider = ({ children }) => {
    const [appReady, setAppReady] = useState(false);
    return (
        <AppReadyContext.Provider value={{ appReady, setAppReady }}>
            {children}
        </AppReadyContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAppReady = () => useContext(AppReadyContext);

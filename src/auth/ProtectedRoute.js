import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export default function AuthWatcher({ children }) {
    const { userId } = useAuth();
    const queryClient = useQueryClient();

    useEffect(() => {
        queryClient.clear();
    }, [userId]);

    return children;
}
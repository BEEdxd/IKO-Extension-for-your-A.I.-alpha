window.IKO = window.IKO || {};

window.IKO.analyzer = {
    analyze() {
        const elements = [
            ...document.querySelectorAll("[data-message-author-role]")
        ];

        const messages = elements
            .map((element) => {
                const roleValue = element.getAttribute("data-message-author-role");
                const text = element.innerText?.trim() || "";

                if (!text) return null;

                let role = "user";

                if (roleValue === "assistant") {
                    role = "assistant";
                } else if (roleValue === "system") {
                    role = "system";
                }

                return {
                    role,
                    content: text
                };
            })
            .filter(Boolean);

        return {
            messages,
            measurement: "OpenAI API count of extracted visible messages"
        };
    }
};
const COOKIE_NAME = "anonymousSession";

export const setCookie = (value: string) => {
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);
  document.cookie = `${COOKIE_NAME}=${value};expires=${expires.toUTCString()};path=/;SameSite=Strict;Secure`;
};

export const checkForCookie = () => {
  const cookies = document.cookie.split(";");
  return cookies.some((c) => c.trim().startsWith(`${COOKIE_NAME}=`));
};


export default interface UserDto {
    email: string,
    smtp_password: string,
    smtp_host: string,
    smtp_ports: { port: number, security: string }[],
};

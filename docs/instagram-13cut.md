# Instagram @13.cut — integración oficial de solo lectura

La portada reutiliza la tarjeta **Instagram** existente y pide hasta cuatro publicaciones de \`/api/public/instagram\`. No cambia reservas, horarios, cobros ni estilos de la web. Si Meta falla, la página sigue funcionando y conserva el enlace al perfil.

## Configuración de Meta

1. En https://developers.facebook.com/apps/ crear/configurar una app de Meta con el caso de uso **Instagram API with Instagram Login** (Business Login). La cuenta @13.cut debe ser profesional (empresa).
2. En la configuración del producto Instagram copiar **Instagram App ID** y **Instagram App Secret** (los del producto Instagram).
3. Agregar exactamente esta URL de redirección autorizada:
   \`https://13-cut.snoservice.uy/api/admin/instagram/callback\`
4. Conceder solo el permiso \`instagram_business_basic\`, habilitar el acceso correspondiente en Meta, y comprobar los requisitos del modo Live/App Review o roles de prueba.
5. Configurar en Vercel, **solo del lado del servidor**:
   - \`INSTAGRAM_APP_ID\`
   - \`INSTAGRAM_APP_SECRET\`
   - \`INSTAGRAM_REDIRECT_URI=https://13-cut.snoservice.uy/api/admin/instagram/callback\`
   - Opcional: \`INSTAGRAM_EXPECTED_USERNAME=13.cut\`
   El secreto de sesión \`SESSION_SECRET\` existente protege el cifrado del token. No modificarlo mientras la cuenta esté conectada.
6. Aplicar la migración \`20261027_instagram_connections.sql\` si no está aplicada. El token se guarda cifrado (AES-256-GCM) en la tabla con RLS y acceso exclusivo de \`service_role\`.
7. Volver a desplegar 13 Cut para activar las variables nuevas. En **Administración → Configuración → Instagram**, abrir **Conectar Instagram**, iniciar sesión con @13.cut y aceptar el permiso. Nunca pedir ni registrar la contraseña del dueño.

La API obtiene contenido en \`https://graph.instagram.com/me/media\` y usa las miniaturas de videos/reels. Se renueva el token prolongado cuando faltan menos de 20 días para su vencimiento, durante una consulta al feed. Si la autorización se revoca o caduca antes de renovar, el dueño puede volver a conectar desde administración. Se guarda en memoria por hasta 5 minutos para no sobrecargar Meta.

El acceso a Instagram es opcional: si faltan las variables o la autorización, el bloque conserva el enlace al perfil y las reservas siguen operativas.

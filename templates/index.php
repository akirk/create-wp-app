<!DOCTYPE html>
<html <?php wp_app_language_attributes(); ?>>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php wp_app_title(); ?></title>
    <?php wp_app_head(); ?>
</head>
<body>
    <?php wp_app_body_open(); ?>

    <main style="max-width: 800px; margin: 2rem auto; padding: 0 1rem;">
        <h1><?php echo esc_html( '{{plugin-name}}' ); ?></h1>
        <p>Welcome to your new WpApp application.</p>
    </main>

    <?php wp_app_body_close(); ?>
</body>
</html>

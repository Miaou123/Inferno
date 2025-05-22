module.exports = {
  apps: [
    {
      name: 'inferno-token',
      script: 'npm',
      args: 'run start',
      cwd: '/home/deployer/Inferno',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/inferno-error.log',
      out_file: './logs/inferno-out.log',
      log_file: './logs/inferno-combined.log',
      time: true,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      autorestart: true,
      kill_timeout: 5000
    }
  ]
};

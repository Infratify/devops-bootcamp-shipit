resource "local_file" "my_file" {
  filename = "nota.txt"

  content = <<-EOT
    Nota Terraform 1 Mula
    DevOps Bootcamp 2026
    Sesi 25 dari 32
    https://infratify.com
    Nota Terraform 1 Akhir
  EOT
}
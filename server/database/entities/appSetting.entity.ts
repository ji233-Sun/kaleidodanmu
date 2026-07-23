import { Column, Entity, PrimaryColumn } from 'typeorm'

/** 通用 key/value 配置；value 为 JSON 字符串。 */
@Entity({ name: 'app_settings' })
export class AppSetting {
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'pk_app_settings' })
  key!: string

  @Column({ type: 'text', default: '{}' })
  value!: string
}

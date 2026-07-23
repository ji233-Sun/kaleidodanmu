import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity({ name: 'users' })
@Index('uq_users_email', ['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'pk_users',
  })
  id!: number

  @Column({ type: 'text', nullable: false })
  email!: string

  @Column({ name: 'password_hash', type: 'text', nullable: false })
  passwordHash!: string

  @Column({ type: 'text', default: 'creator' })
  role!: string

  @Column({
    name: 'created_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date
}
